import type { ExtendedUser } from "@/features/user/user.types";

import type { ConnectedAccount } from "@/generated/prisma";
import type { MessagingService } from "../messaging.service";
import type { BackgroundTaskService } from "@/core/utils/background-task.service";
import type { EventService } from "@/features/event/event.service";
import type { MessagingProvider } from "@/generated/prisma";

import { ConnectedAccountStatus } from "@/generated/prisma";

import * as Sentry from "@sentry/node";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { runWithTenant } from "@/core/decorators/tenant-context";
import { DomainEvent } from "@/features/event/domain-events";

import { isEmailProvider } from "../provider";

import { UnipileHostedAuthCallbackSchema, type UnipileHostedAuthCallback } from "../unipile.schema";
import { deriveAccountFeatures, deriveAccountIdentity, mapUnipileProvider, mapUnipileStatus } from "../unipile.mappers";
import { FindAccountByUnipileIdUnscopedRepo } from "../persistence/find-account-by-unipile-id-unscoped.repo";

export abstract class AccountCallbackUserRepo {
  abstract findExtendedUserByIdOrThrowUnscoped(userId: string): Promise<ExtendedUser>;
}

export abstract class ProcessAccountCallbackRepo extends FindAccountByUnipileIdUnscopedRepo {
  abstract createAccountUnscoped(args: {
    companyId: string;
    userId: string;
    unipileAccountId: string;
    provider: MessagingProvider;
    status: ConnectedAccountStatus;
    displayName: string | null;
    emailAddress: string | null;
    hasMessaging: boolean;
    hasCalendar: boolean;
  }): Promise<ConnectedAccount>;
  abstract updateAccountUnscoped(args: {
    unipileAccountId: string;
    status?: ConnectedAccountStatus;
    displayName?: string | null;
    emailAddress?: string | null;
    provider?: MessagingProvider;
    syncing?: boolean;
    ownerAvatarUrl?: string | null;
    hasMessaging?: boolean;
    hasCalendar?: boolean;
  }): Promise<ConnectedAccount | null>;
  abstract claimBackfillUnscoped(unipileAccountId: string): Promise<string | null>;
}

@SystemInteractor
export class ProcessAccountCallbackInteractor {
  constructor(
    private repo: ProcessAccountCallbackRepo,
    private userRepo: AccountCallbackUserRepo,
    private messagingService: MessagingService,
    private backgroundTaskService: BackgroundTaskService,
    private eventService: EventService,
  ) {}

  @Enforce(UnipileHostedAuthCallbackSchema)
  async invoke(payload: UnipileHostedAuthCallback): Promise<void> {
    // `name` is Unipile's hosted-auth field, which we set to the connecting user's id when
    // creating the link (see MessagingService.createHostedAuthLink), so it round-trips back here.
    const { status, account_id, name: userId } = payload;

    const user = await this.userRepo.findExtendedUserByIdOrThrowUnscoped(userId);
    const existingBefore = await this.repo.findAccountByUnipileIdUnscoped(account_id);

    if (existingBefore && existingBefore.companyId !== user.companyId) {
      throw new Error(
        `cross-company connect blocked for unipile account ${account_id}: owned by company ${existingBefore.companyId}, attempted by user ${user.id} of company ${user.companyId}`,
      );
    }

    if (existingBefore && existingBefore.status === ConnectedAccountStatus.deleted) return;

    if (status === "CREATION_FAIL") {
      if (existingBefore) {
        await this.repo.updateAccountUnscoped({
          unipileAccountId: account_id,
          status: mapUnipileStatus(status),
        });
      }

      return;
    }

    const snapshot = await this.messagingService.getAccountSnapshot(account_id);
    const provider = mapUnipileProvider(snapshot.type);
    const dbStatus = mapUnipileStatus(status);
    const { displayName, emailAddress } = deriveAccountIdentity(snapshot, isEmailProvider(provider));
    const { hasMessaging, hasCalendar } = deriveAccountFeatures(snapshot);

    const { id: connectedAccountId, created } = await runInTransaction(async () => {
      const existing = await this.repo.findAccountByUnipileIdUnscoped(account_id);

      if (existing && existing.companyId !== user.companyId) {
        throw new Error(
          `cross-company connect blocked for unipile account ${account_id}: owned by company ${existing.companyId}, attempted by user ${user.id} of company ${user.companyId}`,
        );
      }

      const id = existing
        ? existing.id
        : (
            await this.repo.createAccountUnscoped({
              companyId: user.companyId,
              userId: user.id,
              unipileAccountId: account_id,
              provider,
              status: dbStatus,
              displayName,
              emailAddress,
              hasMessaging,
              hasCalendar,
            })
          ).id;

      if (existing) {
        await this.repo.updateAccountUnscoped({
          unipileAccountId: account_id,
          status: dbStatus,
          displayName,
          emailAddress,
          provider,
          syncing: true,
          hasMessaging,
          hasCalendar,
        });
      }

      return { id, created: !existing };
    });

    try {
      const payload = { provider, displayName, emailAddress };
      if (created) {
        await runWithTenant(user, () =>
          this.eventService.publish(DomainEvent.CONNECTED_ACCOUNT_CREATED, {
            entityId: connectedAccountId,
            payload,
          }),
        );
      }
    } catch (err) {
      Sentry.captureException(err);
    }

    try {
      const ownerAvatarUrl = await this.messagingService.getOwnerAvatarUrl(account_id);

      if (ownerAvatarUrl) {
        await this.repo.updateAccountUnscoped({
          unipileAccountId: account_id,
          ownerAvatarUrl,
        });
      }
    } catch (err) {
      Sentry.captureException(err);
    }

    try {
      await this.messagingService.triggerHistoryResync({
        accountId: account_id,
        provider,
      });
    } catch (err) {
      Sentry.captureException(err);
    }

    const backfillToken = await this.repo.claimBackfillUnscoped(account_id);
    if (backfillToken) {
      await this.backgroundTaskService.dispatch("backfill-connected-account", {
        connectedAccountId,
        token: backfillToken,
      });
    }
  }
}
