import type { MessagingService } from "../../messaging.service";
import type { MessagingIngestRepo } from "../messaging-ingest.repo";
import type { MessageReactionEntry, MessagingAttendee } from "../../messaging.schema";
import type { ConnectedAccount } from "@/generated/prisma";
import type { BackfillConnectedAccountRepo } from "./backfill.repo";

import { z } from "zod";

import * as Sentry from "@sentry/node";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";

import { EMPTY_ATTENDEE, mapChatAttachments } from "../../unipile.mappers";
import { buildChatMessage, isOutboundChat, mapUnipileChatAttendee } from "../../chat-normalize";
import {
  UnipileChatAttendeeSchema,
  UnipileChatMessageSchema,
  UnipileChatSchema,
  type UnipileChatAttendee,
} from "../../unipile.schema";
import { BackfillCheckpointSchema } from "./backfill-checkpoint.schema";

import { paginate, UNIPILE_MAX_LIMIT } from "./paginate";

type ChatMessageItem = z.infer<typeof UnipileChatMessageSchema>;

function mapBackfillReactions(reactions: ChatMessageItem["reactions"], index: AttendeeIndex): MessageReactionEntry[] {
  return (reactions ?? []).flatMap((reaction) => {
    if (!reaction.value) return [];

    const attendee = reaction.sender_id ? index.byKey.get(reaction.sender_id) : undefined;

    return [
      {
        value: reaction.value,
        attendeeId: attendee?.id ?? reaction.sender_id ?? "",
        attendeeDisplayName: attendee?.name ?? null,
        isSelf: reaction.is_sender === true || attendee?.is_self === true,
      },
    ];
  });
}

type AttendeeIndex = {
  byKey: Map<string, UnipileChatAttendee>;
  selfAttendeeId: string | null;
  selfSender: MessagingAttendee | undefined;
};

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

    const index = await this.loadAccountAttendees(account);

    if (index.selfAttendeeId) {
      await this.repo.setAccountOwnAttendeeIdUnscoped({
        unipileAccountId: account.unipileAccountId,
        ownUnipileAttendeeId: index.selfAttendeeId,
      });
    }

    await this.refreshChatMetadata(account, index);

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
  }

  private async refreshChatMetadata(account: ConnectedAccount, index: AttendeeIndex): Promise<void> {
    await paginate({
      fetchPage: (cursor) =>
        this.messagingService.listChats({
          accountId: account.unipileAccountId,
          limit: UNIPILE_MAX_LIMIT,
          cursor,
        }),
      handleItem: (item) => this.processChat(account, item, index),
    });
  }

  private async processChat(account: ConnectedAccount, rawItem: unknown, index: AttendeeIndex): Promise<number> {
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
    const counterpart =
      chat.type === "single" && chat.attendee_provider_id ? index.byKey.get(chat.attendee_provider_id) : undefined;
    const participants = counterpart && counterpart.is_self !== true ? [mapUnipileChatAttendee(counterpart)] : [];

    try {
      await this.ingest.upsertChatThread({
        companyId: account.companyId,
        connectedAccountId: account.id,
        unipileThreadId: chatId,
        provider: account.provider,
        type: chat.type ?? undefined,
        name: chat.name ?? null,
        subject: chat.subject ?? null,
        participants,
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

    const senderAttendee =
      (raw.sender_attendee_id ? index.byKey.get(raw.sender_attendee_id) : undefined) ??
      (raw.sender_id ? index.byKey.get(raw.sender_id) : undefined);
    const isOutbound = isOutboundChat({
      isSender: raw.is_sender,
      senderIsSelf: senderAttendee?.is_self,
      senderAttendeeId: raw.sender_attendee_id,
      selfAttendeeId: index.selfAttendeeId,
    });
    const sender = senderAttendee ? mapUnipileChatAttendee(senderAttendee) : isOutbound ? index.selfSender : undefined;

    const normalized = buildChatMessage({
      unipileMessageId: raw.id,
      unipileThreadId: raw.chat_id,
      provider: account.provider,
      isOutbound,
      bodyText: raw.text ?? null,
      sender: sender ?? EMPTY_ATTENDEE,
      attachmentsMeta: mapChatAttachments(raw.attachments),
      reactions: mapBackfillReactions(raw.reactions, index),
      isEvent: raw.is_event ?? false,
      deletedAt: raw.deleted ? raw.timestamp : null,
      sentAt: raw.timestamp,
    });

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

  private async loadAccountAttendees(account: ConnectedAccount): Promise<AttendeeIndex> {
    const byKey = new Map<string, UnipileChatAttendee>();
    let self: UnipileChatAttendee | undefined;
    let lastCursor: string | null = null;

    await paginate({
      budget: Number.POSITIVE_INFINITY,
      fetchPage: (cursor) =>
        this.messagingService.listAccountAttendees({
          accountId: account.unipileAccountId,
          limit: UNIPILE_MAX_LIMIT,
          cursor,
        }),
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

        if (parsed.data.provider_id) byKey.set(parsed.data.provider_id, parsed.data);
        if (parsed.data.id) byKey.set(parsed.data.id, parsed.data);
        if (parsed.data.is_self === true) self = parsed.data;
        return 1;
      },
      onPageEnd: (cursor) => {
        lastCursor = cursor;
        return Promise.resolve();
      },
    });

    if (lastCursor) {
      await this.repo.recordUnusableItemUnscoped({
        companyId: account.companyId,
        connectedAccountId: account.id,
        payload: { cursor: lastCursor },
      });
    }

    return {
      byKey,
      selfAttendeeId: self?.id ?? null,
      selfSender: self ? mapUnipileChatAttendee(self) : undefined,
    };
  }
}
