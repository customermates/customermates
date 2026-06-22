import type { MessagingService } from "../messaging.service";
import type { MessagingIngestRepo } from "./messaging-ingest.repo";
import type { ConnectedAccount } from "@/generated/prisma";
import type { BackfillEmailsInteractor } from "./backfill/backfill-emails.interactor";
import type { BackfillChatsInteractor } from "./backfill/backfill-chats.interactor";
import type { BackfillCalendarsInteractor } from "./backfill/backfill-calendars.interactor";

import { z } from "zod";
import * as Sentry from "@sentry/node";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";

import { isEmailProvider } from "../provider";
import { deriveAccountFeatures, deriveAccountIdentity } from "../unipile.mappers";

import type { BackfillConnectedAccountRepo } from "./backfill/backfill.repo";
import type { UnipileAccount } from "../unipile.schema";

const DAY_MS = 24 * 60 * 60 * 1000;
const BACKFILL_SINCE_DAYS = 365;

const ACCOUNT_OK_POLL_INTERVAL_MS = 2000;
const ACCOUNT_OK_POLL_MAX_ATTEMPTS = 30;
const MAX_PROGRESSIVE_ATTEMPTS = 100;

const BackfillConnectedAccountPayloadSchema = z.object({
  connectedAccountId: z.uuid(),
  attempt: z.number().int().nonnegative().optional(),
  token: z.string(),
});
export type BackfillConnectedAccountPayload = z.infer<typeof BackfillConnectedAccountPayloadSchema>;

@SystemInteractor
export class BackfillConnectedAccountInteractor {
  constructor(
    private repo: BackfillConnectedAccountRepo,
    private messagingService: MessagingService,
    private ingest: MessagingIngestRepo,
    private backfillEmails: BackfillEmailsInteractor,
    private backfillChats: BackfillChatsInteractor,
    private backfillCalendars: BackfillCalendarsInteractor,
  ) {}

  @Enforce(BackfillConnectedAccountPayloadSchema)
  async invoke(payload: BackfillConnectedAccountPayload): Promise<boolean> {
    const account = await this.repo.findAccountByIdOrThrowUnscoped(payload.connectedAccountId);
    const { checkpoint, epoch } = await this.repo.loadBackfillCheckpointUnscoped(account.unipileAccountId);

    const ownsClaim = await this.repo.refreshBackfillClaimUnscoped(account.unipileAccountId, payload.token);
    if (!ownsClaim) return false;

    const afterDate = new Date(Date.now() - BACKFILL_SINCE_DAYS * DAY_MS);
    const isEmail = isEmailProvider(account.provider);

    const snapshot = await this.waitForAccountReady(account.unipileAccountId);
    const { hasMessaging, hasCalendar } = await this.refreshAccountFromSnapshot(account, snapshot, isEmail);

    const before = await this.ingest.countMessagesUnscoped(account.id);

    const messagingDone = !hasMessaging
      ? true
      : isEmail
        ? await this.runBackfillStep(account, "email", () =>
            this.backfillEmails.invoke({ account, afterDate, checkpoint, epoch }),
          )
        : await this.runBackfillStep(account, "chat", () =>
            this.backfillChats.invoke({ account, afterDate, checkpoint, epoch }),
          );

    const calendarRan = hasCalendar
      ? await this.runBackfillStep(account, "calendar", () =>
          this.backfillCalendars.invoke({ account, afterDate, checkpoint, epoch }),
        )
      : false;

    const attempt = payload.attempt ?? 0;
    const total = await this.ingest.countMessagesUnscoped(account.id);
    const { checkpoint: reloaded, epoch: currentEpoch } = await this.repo.loadBackfillCheckpointUnscoped(
      account.unipileAccountId,
    );
    const messagingStep = isEmail ? reloaded.email : reloaded.chat;
    const messagingExhausted = !hasMessaging || !messagingStep?.cursor;
    const ingestedSomethingNew = total > before;
    const awaitingInitialSync = total === 0;
    const messagingTruncated = messagingDone && hasMessaging && !messagingExhausted;
    const calendarIncomplete = calendarRan && reloaded.calendar?.done !== true;
    const epochChanged = currentEpoch !== epoch;

    if (
      (ingestedSomethingNew || awaitingInitialSync || messagingTruncated || calendarIncomplete || epochChanged) &&
      attempt < MAX_PROGRESSIVE_ATTEMPTS
    ) {
      await this.repo.updateAccountUnscoped({
        unipileAccountId: account.unipileAccountId,
        lastSyncedAt: new Date(),
      });

      return true;
    }

    if (messagingDone && messagingExhausted) {
      await this.repo.saveBackfillStepCheckpointUnscoped({
        unipileAccountId: account.unipileAccountId,
        step: isEmail ? "email" : "chat",
        checkpoint: { done: true },
        epoch,
      });
    }

    const finalized = await this.repo.finalizeBackfillUnscoped({
      unipileAccountId: account.unipileAccountId,
      epoch,
      token: payload.token,
    });

    return !finalized;
  }

  private async runBackfillStep(account: ConnectedAccount, step: string, run: () => Promise<void>): Promise<boolean> {
    try {
      await run();

      return true;
    } catch (err) {
      Sentry.captureException(err);
      await this.repo.recordUnusableItemUnscoped({
        companyId: account.companyId,
        connectedAccountId: account.id,
        payload: { step },
      });

      return false;
    }
  }

  private async refreshAccountFromSnapshot(
    account: ConnectedAccount,
    snapshot: UnipileAccount,
    isEmail: boolean,
  ): Promise<{ hasMessaging: boolean; hasCalendar: boolean }> {
    const features = deriveAccountFeatures(snapshot);
    const identity = deriveAccountIdentity(snapshot, isEmail);
    const hasMessaging = account.hasMessaging || features.hasMessaging;
    const hasCalendar = account.hasCalendar || features.hasCalendar;

    const update: Parameters<BackfillConnectedAccountRepo["updateAccountUnscoped"]>[0] = {
      unipileAccountId: account.unipileAccountId,
    };
    if (hasMessaging !== account.hasMessaging) update.hasMessaging = hasMessaging;
    if (hasCalendar !== account.hasCalendar) update.hasCalendar = hasCalendar;
    if (!account.displayName && identity.displayName) update.displayName = identity.displayName;
    if (!account.emailAddress && identity.emailAddress) update.emailAddress = identity.emailAddress;
    if (Object.keys(update).length > 1) await this.repo.updateAccountUnscoped(update);

    return { hasMessaging, hasCalendar };
  }

  private async waitForAccountReady(unipileAccountId: string): Promise<UnipileAccount> {
    let snapshot = await this.messagingService.getAccountSnapshot(unipileAccountId);

    for (let attempt = 0; attempt < ACCOUNT_OK_POLL_MAX_ATTEMPTS; attempt++) {
      const isReady = (snapshot.sources ?? []).some((s) => s.status?.toUpperCase() === "OK");
      if (isReady) return snapshot;

      await new Promise((resolve) => setTimeout(resolve, ACCOUNT_OK_POLL_INTERVAL_MS));
      snapshot = await this.messagingService.getAccountSnapshot(unipileAccountId);
    }

    Sentry.captureMessage(
      `backfill: account ${unipileAccountId} not ready after ${ACCOUNT_OK_POLL_MAX_ATTEMPTS} polls`,
      "warning",
    );

    return snapshot;
  }
}
