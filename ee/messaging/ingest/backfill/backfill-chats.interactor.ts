import type { MessagingService } from "../../messaging.service";
import type { MessagingIngestRepo } from "../messaging-ingest.repo";
import type { MessagingAttendee } from "../../messaging.schema";
import type { ConnectedAccount } from "@/generated/prisma";
import type { BackfillConnectedAccountRepo } from "./backfill.repo";

import { z } from "zod";

import * as Sentry from "@sentry/node";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";

import {
  indexAttendee,
  mapUnipileChatAttendee,
  normalizeChatMessage,
  resolveChatSender,
  type ChatSenderLookup,
} from "../../chat-normalize";
import { UnipileChatAttendeeSchema, UnipileChatMessageSchema, UnipileChatSchema } from "../../unipile.schema";
import { BackfillCheckpointSchema } from "./backfill-checkpoint.schema";

import { paginate, UNIPILE_MAX_LIMIT } from "./paginate";

type AttendeeIndex = ChatSenderLookup & { rosteredChats: Set<string> };

const Schema = z.object({
  account: z.custom<ConnectedAccount>(),
  afterDate: z.date(),
  checkpoint: BackfillCheckpointSchema,
  epoch: z.number(),
});
type BackfillChatsPayload = z.infer<typeof Schema>;

@SystemInteractor
export class BackfillChatsInteractor {
  constructor(
    private repo: BackfillConnectedAccountRepo,
    private messagingService: MessagingService,
    private ingest: MessagingIngestRepo,
  ) {}

  @Enforce(Schema)
  async invoke({ account, afterDate, checkpoint, epoch }: BackfillChatsPayload): Promise<void> {
    if (checkpoint.chat?.done) return;

    const index: AttendeeIndex = {
      byKey: new Map(),
      selfAttendeeId: null,
      selfSender: undefined,
      rosteredChats: new Set(),
    };

    await this.refreshChatMetadata(account);

    await paginate({
      startCursor: checkpoint.chat?.cursor ?? undefined,
      fetchPage: (cursor) =>
        this.messagingService.listMessages({
          accountId: account.unipileAccountId,
          limit: UNIPILE_MAX_LIMIT,
          cursor,
          after: afterDate.toISOString(),
        }),
      handleItem: (item) => this.processMessage(account, item, index),
      onPageEnd: (cursor) =>
        this.repo.saveBackfillStepCheckpointUnscoped({
          unipileAccountId: account.unipileAccountId,
          step: "chat",
          checkpoint: { cursor },
          epoch,
        }),
    });

    if (index.selfAttendeeId) {
      await this.repo.setAccountOwnAttendeeIdUnscoped({
        unipileAccountId: account.unipileAccountId,
        ownUnipileAttendeeId: index.selfAttendeeId,
      });
    }
  }

  private async refreshChatMetadata(account: ConnectedAccount): Promise<void> {
    await paginate({
      fetchPage: (cursor) =>
        this.messagingService.listChats({
          accountId: account.unipileAccountId,
          limit: UNIPILE_MAX_LIMIT,
          cursor,
        }),
      handleItem: (item) => this.processChat(account, item),
    });
  }

  private async processChat(account: ConnectedAccount, rawItem: unknown): Promise<number> {
    const parsed = UnipileChatSchema.safeParse(rawItem);

    if (!parsed.success || !parsed.data.id) {
      await this.repo.recordUnusableItemUnscoped({
        companyId: account.companyId,
        connectedAccountId: account.id,
        payload: rawItem,
      });

      return 1;
    }

    const chat = parsed.data;
    const chatId = parsed.data.id;

    try {
      await this.ingest.upsertChatThread({
        companyId: account.companyId,
        connectedAccountId: account.id,
        unipileThreadId: chatId,
        provider: account.provider,
        type: chat.type ?? undefined,
        name: chat.name ?? null,
        subject: chat.subject ?? null,
        participants: [],
      });
      return 1;
    } catch (err) {
      Sentry.captureException(err);
      await this.repo.recordUnusableItemUnscoped({
        companyId: account.companyId,
        connectedAccountId: account.id,
        payload: chat,
      });

      return 1;
    }
  }

  private async processMessage(account: ConnectedAccount, rawItem: unknown, index: AttendeeIndex): Promise<number> {
    const parsed = UnipileChatMessageSchema.safeParse(rawItem);

    if (!parsed.success) {
      await this.repo.recordUnusableItemUnscoped({
        companyId: account.companyId,
        connectedAccountId: account.id,
        payload: rawItem,
      });
      return 1;
    }

    const raw = parsed.data;

    if (raw.hidden) return 1;

    if (!raw.id || !raw.chat_id) {
      await this.repo.recordUnusableItemUnscoped({
        companyId: account.companyId,
        connectedAccountId: account.id,
        payload: raw,
        unipileMessageId: raw.id ?? null,
      });

      return 1;
    }

    if (!resolveChatSender(raw, index) && !index.rosteredChats.has(raw.chat_id)) {
      const participants = await this.loadChatParticipants(account, raw.chat_id, index);

      if (participants.length) {
        await this.ingest.upsertChatThread({
          companyId: account.companyId,
          connectedAccountId: account.id,
          unipileThreadId: raw.chat_id,
          provider: account.provider,
          subject: null,
          participants,
        });
      }
    }

    const normalized = normalizeChatMessage(raw, index, account.provider);
    if (!normalized) return 1;

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

  private async loadChatParticipants(
    account: ConnectedAccount,
    chatId: string,
    index: AttendeeIndex,
  ): Promise<MessagingAttendee[]> {
    index.rosteredChats.add(chatId);
    const participants: MessagingAttendee[] = [];

    try {
      await paginate({
        budget: Number.POSITIVE_INFINITY,
        fetchPage: (cursor) => this.messagingService.listChatAttendees({ chatId, limit: UNIPILE_MAX_LIMIT, cursor }),
        handleItem: async (raw) => {
          const parsed = UnipileChatAttendeeSchema.safeParse(raw);

          if (!parsed.success) {
            await this.repo.recordUnusableItemUnscoped({
              companyId: account.companyId,
              connectedAccountId: account.id,
              payload: raw,
            });
            return 1;
          }

          indexAttendee(index, parsed.data);
          if (parsed.data.is_self !== true) participants.push(mapUnipileChatAttendee(parsed.data));
          return 1;
        },
      });
    } catch (err) {
      Sentry.captureException(err);
    }

    return participants;
  }
}
