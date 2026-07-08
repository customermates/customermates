import type { MessagingService } from "../../messaging.service";
import type { ConnectedAccount } from "@/generated/prisma";
import type { BackfillConnectedAccountRepo } from "./backfill.repo";

import { z } from "zod";
import * as Sentry from "@sentry/node";

import { ConnectedAccountStatus, MessagingProvider } from "@/generated/prisma";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";

import { deriveLinkedinProducts, isEmailProvider } from "../../provider";
import { BACKFILL_EMAIL_TIMEOUT_MS } from "./paginate";
import { isUnipileRateLimit } from "../../messaging.service";
import { deriveAccountFeatures, mapUnipileProvider, mapUnipileStatus } from "../../unipile.mappers";
import {
  buildFolderCatalog,
  defaultSelectedFolderIds,
  isSkippedEmailFolder,
  isSentEmailFolder,
} from "../../email-folders";
import { UnipileFolderSchema, UnipileInboxSchema, type UnipileAccount } from "../../unipile.schema";

export const ACCOUNT_WIDE_SOURCE = "__account_wide__";

export function classifyAccountReadiness(account: UnipileAccount): "ready" | "waiting" | "stalled" {
  if (account.status === "disconnected" || account.status === "paused") return "stalled";

  const syncStatus = account.initial_sync?.status;
  if (syncStatus) return syncStatus === "completed" || syncStatus === "failed" ? "ready" : "waiting";

  return account.status === "running" ? "ready" : "waiting";
}

export type BackfillPlan =
  | { status: "stopped" }
  | { status: "waiting" }
  | { status: "ready"; kind: "chat" | "email" | "none"; sources: string[]; hasCalendar: boolean };

const Schema = z.object({
  connectedAccountId: z.uuid(),
  token: z.string(),
  sourceFilter: z.array(z.string()).optional(),
});
type PrepareBackfillPayload = z.infer<typeof Schema>;

@SystemInteractor
export class PrepareBackfillInteractor {
  constructor(
    private repo: BackfillConnectedAccountRepo,
    private messagingService: MessagingService,
  ) {}

  @Enforce(Schema)
  async invoke({ connectedAccountId, token, sourceFilter }: PrepareBackfillPayload): Promise<BackfillPlan> {
    const account = await this.repo.findAccountByIdUnscoped(connectedAccountId);
    if (!account || account.status === ConnectedAccountStatus.deleted || account.backfillClaimToken !== token)
      return { status: "stopped" };

    const snapshot = await this.fetchAccount(account.unipileAccountId);
    if (snapshot) {
      const readiness = classifyAccountReadiness(snapshot);
      if (readiness === "stalled") return { status: "stopped" };
      if (readiness === "waiting") return { status: "waiting" };
    }

    const features = snapshot
      ? await this.refreshAccountFromSnapshot(account, snapshot)
      : { hasMessaging: account.hasMessaging, hasCalendar: account.hasCalendar };
    const provider = snapshot ? mapUnipileProvider(snapshot.provider) : account.provider;

    const kind = !features.hasMessaging ? "none" : isEmailProvider(provider) ? "email" : "chat";
    const sources =
      kind === "chat"
        ? await this.resolveChatSources(account.unipileAccountId, provider)
        : kind === "email"
          ? await this.resolveEmailFolders(account, sourceFilter)
          : [];

    return { status: "ready", kind, sources, hasCalendar: features.hasCalendar };
  }

  private async fetchAccount(unipileAccountId: string): Promise<UnipileAccount | null> {
    let snapshot: UnipileAccount;
    try {
      snapshot = await this.messagingService.getAccount(unipileAccountId);
    } catch (err) {
      if (isUnipileRateLimit(err)) return null;
      if (err instanceof z.ZodError) {
        Sentry.captureException(err, { tags: { unipileAccountId } });

        return null;
      }
      throw err;
    }

    if (snapshot.initial_sync?.status === "failed") {
      Sentry.captureMessage(`backfill v2: account ${unipileAccountId} initial sync failed`, {
        level: "warning",
        tags: { unipileAccountId },
      });
    }

    return snapshot;
  }

  private async refreshAccountFromSnapshot(
    account: ConnectedAccount,
    snapshot: UnipileAccount,
  ): Promise<{ hasMessaging: boolean; hasCalendar: boolean }> {
    const features = deriveAccountFeatures(snapshot);
    const hasMessaging = account.hasMessaging || features.hasMessaging;
    const hasCalendar = account.hasCalendar || features.hasCalendar;

    const update: Parameters<BackfillConnectedAccountRepo["updateAccountUnscoped"]>[0] = {
      unipileAccountId: account.unipileAccountId,
      providerSyncing: false,
    };
    if (hasMessaging !== account.hasMessaging) update.hasMessaging = hasMessaging;
    if (hasCalendar !== account.hasCalendar) update.hasCalendar = hasCalendar;
    if (!account.displayName && snapshot.name) update.displayName = snapshot.name;
    if (account.status === ConnectedAccountStatus.connecting) update.status = mapUnipileStatus(snapshot.status);

    await this.repo.updateAccountUnscoped(update);

    return { hasMessaging, hasCalendar };
  }

  private async resolveChatSources(unipileAccountId: string, provider: MessagingProvider): Promise<string[]> {
    if (provider !== MessagingProvider.linkedin) return [ACCOUNT_WIDE_SOURCE];

    const items = await this.messagingService
      .listInboxes({ accountId: unipileAccountId })
      .then((page) => page.data ?? [])
      .catch(() => [] as unknown[]);

    const inboxIds: string[] = [];
    for (const raw of items) {
      const parsed = UnipileInboxSchema.safeParse(raw);
      if (parsed.success && parsed.data.disabled !== true) inboxIds.push(parsed.data.id);
    }

    if (inboxIds.length === 0) return [ACCOUNT_WIDE_SOURCE];

    await this.repo.updateAccountUnscoped({ unipileAccountId, linkedinProducts: deriveLinkedinProducts(inboxIds) });

    return inboxIds.sort();
  }

  private async resolveEmailFolders(account: ConnectedAccount, sourceFilter?: string[]): Promise<string[]> {
    const items = await this.messagingService
      .listFolders({ accountId: account.unipileAccountId, timeoutMs: BACKFILL_EMAIL_TIMEOUT_MS })
      .then((page) => page.data ?? [])
      .catch(() => [] as unknown[]);

    const folders = items.flatMap((raw) => {
      const parsed = UnipileFolderSchema.safeParse(raw);
      return parsed.success ? [parsed.data] : [];
    });
    if (folders.length === 0) return [];

    const sentFolderIds = folders.filter(isSentEmailFolder).map((folder) => folder.id);
    const selectedFolderIds =
      account.foldersSyncedAt === null ? defaultSelectedFolderIds(folders) : account.selectedFolderIds;
    await this.repo.updateAccountUnscoped({
      unipileAccountId: account.unipileAccountId,
      folders: buildFolderCatalog(folders),
      foldersSyncedAt: new Date(),
      ...(sentFolderIds.length > 0 ? { sentFolderIds } : {}),
      ...(account.foldersSyncedAt === null ? { selectedFolderIds } : {}),
    });

    if (sourceFilter && sourceFilter.length > 0) {
      const requested = sourceFilter.filter((id) => folders.some((folder) => folder.id === id));
      return requested.length > 0 ? requested.sort() : [];
    }

    const drained = folders
      .filter((folder) => !isSkippedEmailFolder(folder) || selectedFolderIds.includes(folder.id))
      .map((folder) => folder.id);
    return drained.sort();
  }
}
