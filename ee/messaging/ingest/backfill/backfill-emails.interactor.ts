import type { MessagingService } from "../../messaging.service";
import type { MessagingIngestRepo } from "../messaging-ingest.repo";
import type { ConnectedAccount } from "@/generated/prisma";
import type { BackfillConnectedAccountRepo } from "./backfill.repo";
import type { PageResult } from "./paginate";

import { z } from "zod";

import * as Sentry from "@sentry/node";

import { ConnectedAccountStatus } from "@/generated/prisma";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";

import { buildEmailMessage } from "../../unipile.mappers";
import { UnipileEmailSchema } from "../../unipile.schema";

import { BACKFILL_EMAIL_TIMEOUT_MS, backfillSince, paginateStep, UNIPILE_EMAIL_MAX_LIMIT } from "./paginate";
import { ACCOUNT_WIDE_SOURCE } from "./prepare-backfill.interactor";

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
  ) {}

  @Enforce(Schema)
  async invoke({ connectedAccountId, source, cursor }: BackfillEmailsPayload): Promise<PageResult> {
    const account = await this.repo.findAccountByIdUnscoped(connectedAccountId);
    if (!account || account.status === ConnectedAccountStatus.deleted) return { nextCursor: null, done: true };

    const since = backfillSince();
    const after = since.toISOString();
    const seenIds = new Set<string>();

    const result = await paginateStep({
      startCursor: cursor,
      limit: UNIPILE_EMAIL_MAX_LIMIT,
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

    if (result.done && cursor === null && source !== ACCOUNT_WIDE_SOURCE) {
      await this.ingest.reconcileFolderMembershipUnscoped({
        companyId: account.companyId,
        connectedAccountId: account.id,
        folderId: source,
        since,
        seenUnipileMessageIds: [...seenIds],
      });
    }

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
      await this.ingest.ingestMessageUnscoped({
        companyId: account.companyId,
        connectedAccountId: account.id,
        message: normalized,
        backfill: true,
      });
    } catch (err) {
      Sentry.captureException(err, {
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
