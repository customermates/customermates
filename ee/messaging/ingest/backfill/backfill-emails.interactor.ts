import type { MessagingService } from "../../messaging.service";
import type { MessagingIngestRepo } from "../messaging-ingest.repo";
import type { ConnectedAccount } from "@/generated/prisma";
import type { BackfillConnectedAccountRepo } from "./backfill.repo";
import type { PageResult } from "./paginate";

import { z } from "zod";

import * as ErrorReporter from "@/core/observability/server";

import { ConnectedAccountStatus } from "@/generated/prisma";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";

import { buildEmailMessage } from "../../unipile.mappers";
import { UnipileEmailSchema } from "../../unipile.schema";

import {
  BACKFILL_EMAIL_PAGE_BUDGET,
  BACKFILL_EMAIL_STEP_BUDGET_MS,
  BACKFILL_EMAIL_TIMEOUT_MS,
  backfillSince,
  paginateStep,
  UNIPILE_EMAIL_MAX_LIMIT,
} from "./paginate";
import { ACCOUNT_WIDE_SOURCE } from "./prepare-backfill.interactor";
import { synchronizeInboundAvatar, type ProviderAvatars } from "../inbound-avatar";

const Schema = z.object({
  connectedAccountId: z.uuid(),
  source: z.string(),
  cursor: z.string().nullable(),
});
type BackfillEmailsPayload = z.infer<typeof Schema>;

@SystemInteractor
export class BackfillEmailsInteractor {
  constructor(
    private repo: BackfillConnectedAccountRepo,
    private messagingService: MessagingService,
    private ingest: MessagingIngestRepo,
    private avatars: ProviderAvatars,
  ) {}

  @Enforce(Schema)
  async invoke({ connectedAccountId, source, cursor }: BackfillEmailsPayload): Promise<PageResult> {
    const account = await this.repo.findAccountByIdUnscoped(connectedAccountId);
    if (!account || account.status === ConnectedAccountStatus.deleted)
      return { nextCursor: null, done: true, complete: false };

    const since = backfillSince();
    const after = since.toISOString();
    const seenIds = new Set<string>();
    const folderPass =
      source === ACCOUNT_WIDE_SOURCE
        ? null
        : { companyId: account.companyId, connectedAccountId: account.id, folderId: source };

    if (folderPass && cursor === null) await this.repo.clearEmailFolderPassUnscoped(folderPass);

    const result = await paginateStep({
      startCursor: cursor,
      limit: UNIPILE_EMAIL_MAX_LIMIT,
      maxPages: BACKFILL_EMAIL_PAGE_BUDGET,
      timeBudgetMs: BACKFILL_EMAIL_STEP_BUDGET_MS,
      fetchPage: (query) =>
        source === ACCOUNT_WIDE_SOURCE
          ? this.messagingService.listEmails({
              accountId: account.unipileAccountId,
              after,
              limit: UNIPILE_EMAIL_MAX_LIMIT,
              cursor: query.cursor,
              offset: query.offset,
              timeoutMs: BACKFILL_EMAIL_TIMEOUT_MS,
            })
          : this.messagingService.listFolderEmails({
              accountId: account.unipileAccountId,
              folderId: source,
              after,
              limit: UNIPILE_EMAIL_MAX_LIMIT,
              cursor: query.cursor,
              offset: query.offset,
              timeoutMs: BACKFILL_EMAIL_TIMEOUT_MS,
            }),
      handleItem: async (rawEmail) => {
        const unipileMessageId = await this.upsertEmailThread(account, rawEmail);
        if (unipileMessageId) seenIds.add(unipileMessageId);
      },
    });

    if (!folderPass) return result;

    if (!result.done) {
      await this.repo.recordEmailFolderPassSeenUnscoped({ ...folderPass, unipileMessageIds: [...seenIds] });
      return result;
    }

    if (result.complete) {
      const earlierIds = cursor === null ? [] : await this.repo.listEmailFolderPassSeenUnscoped(folderPass);
      await this.ingest.reconcileFolderMembershipUnscoped({
        ...folderPass,
        since,
        seenUnipileMessageIds: [...earlierIds, ...seenIds],
      });
    }

    if (cursor !== null) await this.repo.clearEmailFolderPassUnscoped(folderPass);

    return result;
  }

  private async upsertEmailThread(account: ConnectedAccount, rawEmail: unknown): Promise<string | null> {
    const parsed = UnipileEmailSchema.safeParse(rawEmail);

    if (!parsed.success) {
      await this.repo.recordUnusableItemUnscoped({
        companyId: account.companyId,
        connectedAccountId: account.id,
        payload: rawEmail,
      });

      return null;
    }

    const normalized = buildEmailMessage(parsed.data, {
      provider: account.provider,
      emailAddress: account.emailAddress,
      sentFolderIds: account.sentFolderIds,
    });

    if (!normalized) {
      await this.repo.recordUnusableItemUnscoped({
        companyId: account.companyId,
        connectedAccountId: account.id,
        payload: parsed.data,
        unipileMessageId: parsed.data.id,
      });

      return null;
    }

    try {
      const ingested = await this.ingest.ingestMessageUnscoped({
        companyId: account.companyId,
        connectedAccountId: account.id,
        message: normalized,
        backfill: true,
      });
      await synchronizeInboundAvatar(this.avatars, account.companyId, ingested);
    } catch (err) {
      ErrorReporter.captureException(err, {
        tags: {
          unipileAccountId: account.unipileAccountId,
          companyId: account.companyId,
          connectedAccountId: account.id,
          step: "email",
        },
      });
      await this.repo.recordUnusableItemUnscoped({
        companyId: account.companyId,
        connectedAccountId: account.id,
        payload: parsed.data,
        unipileMessageId: parsed.data.id,
      });

      return null;
    }

    return parsed.data.id;
  }
}
