import type { MessagingService } from "../../messaging.service";
import type { MessagingIngestRepo } from "../messaging-ingest.repo";
import type { ConnectedAccount } from "@/generated/prisma";
import type { BackfillConnectedAccountRepo } from "./backfill.repo";
import type { PageResult } from "./paginate";

import { z } from "zod";

import * as Sentry from "@sentry/node";

import { ConnectedAccountStatus, MessagingMessageDirection } from "@/generated/prisma";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";

import { buildEmailMessage } from "../../unipile.mappers";
import { UnipileEmailSchema } from "../../unipile.schema";

import { backfillSince, paginateStep, UNIPILE_EMAIL_MAX_LIMIT } from "./paginate";
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

    const after = backfillSince().toISOString();

    return paginateStep({
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
            })
          : this.messagingService.listFolderEmails({
              accountId: account.unipileAccountId,
              folderId: source,
              after,
              limit: UNIPILE_EMAIL_MAX_LIMIT,
              cursor: query.cursor,
              offset: query.offset,
            }),
      handleItem: (item) => this.upsertEmailThread(account, item),
    });
  }

  private async upsertEmailThread(account: ConnectedAccount, item: unknown): Promise<void> {
    const parsed = UnipileEmailSchema.safeParse(item);

    if (!parsed.success) {
      await this.repo.recordUnusableItemUnscoped({
        companyId: account.companyId,
        connectedAccountId: account.id,
        payload: item,
      });
      return;
    }

    await this.repo.recordRawBackfillItemUnscoped({
      companyId: account.companyId,
      connectedAccountId: account.id,
      accountId: account.unipileAccountId,
      itemType: "email",
      payload: item,
      unipileMessageId: parsed.data.id ?? null,
    });

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
        unipileMessageId: parsed.data.id ?? null,
      });
      return;
    }

    try {
      await this.ingest.upsertChatThreadUnscoped({
        companyId: account.companyId,
        connectedAccountId: account.id,
        unipileThreadId: normalized.unipileThreadId,
        provider: account.provider,
        type: normalized.threadType,
        name: null,
        subject: normalized.subject,
        participants: [normalized.sender, ...normalized.recipients.to, ...normalized.recipients.cc],
        lastMessageAt: normalized.sentAt,
        lastMessagePreview: parsed.data.snippet ?? null,
        lastMessageIsSender: normalized.direction === MessagingMessageDirection.outbound,
      });

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
        unipileMessageId: parsed.data.id ?? null,
      });
    }
  }
}
