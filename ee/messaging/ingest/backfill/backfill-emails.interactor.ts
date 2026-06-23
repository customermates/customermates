import type { MessagingService } from "../../messaging.service";
import type { MessagingIngestRepo } from "../messaging-ingest.repo";
import type { ConnectedAccount } from "@/generated/prisma";
import type { BackfillConnectedAccountRepo } from "./backfill.repo";

import { z } from "zod";

import * as Sentry from "@sentry/node";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";

import { buildEmailMessage } from "../../unipile.mappers";
import { UnipileEmailSchema } from "../../unipile.schema";
import { BackfillCheckpointSchema } from "./backfill-checkpoint.schema";

import { paginate, UNIPILE_MAX_LIMIT } from "./paginate";

const Schema = z.object({
  account: z.custom<ConnectedAccount>(),
  afterDate: z.date(),
  checkpoint: BackfillCheckpointSchema,
  epoch: z.number(),
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
  async invoke({ account, afterDate, checkpoint, epoch }: BackfillEmailsPayload): Promise<void> {
    if (checkpoint.email?.done) return;

    await paginate({
      startCursor: checkpoint.email?.cursor ?? undefined,
      fetchPage: (cursor) =>
        this.messagingService.listEmails({
          accountId: account.unipileAccountId,
          after: afterDate.toISOString(),
          limit: UNIPILE_MAX_LIMIT,
          cursor,
        }),
      handleItem: (item) => this.processEmailItem(account, item),
      onPageEnd: (cursor) =>
        this.repo.saveBackfillStepCheckpointUnscoped({
          unipileAccountId: account.unipileAccountId,
          step: "email",
          checkpoint: { cursor },
          epoch,
        }),
    });
  }

  private async processEmailItem(account: ConnectedAccount, item: unknown): Promise<number> {
    const parsed = UnipileEmailSchema.safeParse(item);

    if (!parsed.success) {
      await this.repo.recordUnusableItemUnscoped({
        companyId: account.companyId,
        connectedAccountId: account.id,
        payload: item,
      });
      return 1;
    }

    const normalized = buildEmailMessage(parsed.data, parsed.data.role === "sent");

    if (!normalized) {
      await this.repo.recordUnusableItemUnscoped({
        companyId: account.companyId,
        connectedAccountId: account.id,
        payload: parsed.data,
        unipileMessageId: parsed.data.email_id ?? parsed.data.id ?? null,
      });
      return 1;
    }

    try {
      await this.ingest.ingestMessage({
        companyId: account.companyId,
        connectedAccountId: account.id,
        message: normalized,
        backfill: true,
      });
      return 1;
    } catch (err) {
      Sentry.captureException(err);
      await this.repo.recordUnusableItemUnscoped({
        companyId: account.companyId,
        connectedAccountId: account.id,
        payload: normalized,
        unipileMessageId: normalized.unipileMessageId,
      });
      return 1;
    }
  }
}
