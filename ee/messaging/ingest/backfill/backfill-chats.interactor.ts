import type { MessagingService } from "../../messaging.service";
import type { MessagingIngestRepo } from "../messaging-ingest.repo";
import type { MessagingAttendee, IngestMessage } from "../../messaging.schema";
import type { ConnectedAccount, MessagingThreadType } from "@/generated/prisma";
import type { UnipileChat, UnipileMessage } from "../../unipile.schema";
import type { BackfillConnectedAccountRepo } from "./backfill.repo";
import type { PageResult } from "./paginate";

import { z } from "zod";

import * as Sentry from "@sentry/node";

import { ConnectedAccountStatus, MessagingProvider } from "@/generated/prisma";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";

import { isExcludedChatId, mapParticipantRecord, mapUnipileUser, normalizeChatMessage } from "../../chat-normalize";
import { UnipileChatSchema, UnipileMessageSchema } from "../../unipile.schema";
import { ACCOUNT_WIDE_SOURCE } from "./prepare-backfill.interactor";

import { BACKFILL_MESSAGE_PAGE_BUDGET, UNIPILE_MAX_LIMIT, paginateStep } from "./paginate";
import { isUnipileRateLimit } from "../../messaging.service";

const BACKFILL_MESSAGE_TIMEOUT_MS = 10_000;

function isSelfAccount(account: ConnectedAccount, identifier: string | null | undefined): boolean {
  const ownDigits = (account.displayName ?? "").replace(/\D/g, "");

  return ownDigits.length > 0 && (identifier ?? "").replace(/\D/g, "") === ownDigits;
}

function altThreadIdFromChat(chat: UnipileChat, provider: MessagingProvider): string | null {
  if (provider === MessagingProvider.linkedin) return null;
  if (chat.is_group || chat.is_channel) return null;
  const alt = chat.user_id;
  if (!alt || alt === "undefined" || alt === chat.id) return null;

  return alt;
}

const Schema = z.object({
  connectedAccountId: z.uuid(),
  source: z.string(),
  cursor: z.string().nullable(),
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
  async invoke({ connectedAccountId, source, cursor }: BackfillChatsPayload): Promise<PageResult> {
    const account = await this.repo.findAccountByIdUnscoped(connectedAccountId);
    if (!account || account.status === ConnectedAccountStatus.deleted)
      return { nextCursor: null, done: true, complete: false };

    const limit = UNIPILE_MAX_LIMIT;

    return paginateStep({
      startCursor: cursor,
      limit,
      fetchPage: (query) =>
        source === ACCOUNT_WIDE_SOURCE
          ? this.messagingService.listChats({
              accountId: account.unipileAccountId,
              cursor: query.cursor,
              offset: query.offset,
              limit,
            })
          : this.messagingService.listInboxChats({
              accountId: account.unipileAccountId,
              inboxId: source,
              cursor: query.cursor,
              offset: query.offset,
              limit,
            }),
      handleItem: (rawChat) => this.upsertChatThread(account, rawChat),
    });
  }

  private async upsertChatThread(account: ConnectedAccount, rawChat: unknown): Promise<void> {
    const parsed = UnipileChatSchema.safeParse(rawChat);

    if (!parsed.success) {
      await this.repo.recordUnusableItemUnscoped({
        companyId: account.companyId,
        connectedAccountId: account.id,
        payload: rawChat,
      });

      return;
    }

    const chat = parsed.data;
    if (isExcludedChatId(chat.id)) return;

    const current = await this.isThreadCurrent(account.id, chat);

    const type: MessagingThreadType = chat.is_group ? "group" : chat.is_channel ? "channel" : "single";
    const participants = await this.resolveParticipants(account, chat, { allowFetch: !current });
    const lastActivity = chat.last_message_timestamp ?? chat.updated_at ?? null;
    const lastMessageText = chat.last_message?.text?.trim() || null;

    try {
      await this.ingest.upsertChatThreadUnscoped({
        companyId: account.companyId,
        connectedAccountId: account.id,
        unipileThreadId: chat.id,
        unipileThreadAltId: altThreadIdFromChat(chat, account.provider),
        provider: account.provider,
        type,
        name: chat.name ?? null,
        subject: chat.description ?? null,
        participants,
        lastMessageAt: lastMessageText && lastActivity ? new Date(lastActivity) : undefined,
        lastMessagePreview: lastMessageText ?? undefined,
        lastMessageIsSender: lastMessageText ? (chat.last_message?.is_sender ?? null) : undefined,
      });
    } catch (err) {
      Sentry.captureException(err, {
        tags: {
          unipileAccountId: account.unipileAccountId,
          companyId: account.companyId,
          connectedAccountId: account.id,
          step: "chat",
        },
      });
      await this.repo.recordUnusableItemUnscoped({
        companyId: account.companyId,
        connectedAccountId: account.id,
        payload: chat,
        unipileMessageId: chat.id,
      });

      return;
    }

    if (current) return;

    await this.pullAndIngestMessages(account, chat.id);
  }

  private async isThreadCurrent(connectedAccountId: string, chat: UnipileChat): Promise<boolean> {
    if (!chat.last_message_timestamp) return false;

    const latestMessageAt = await this.ingest.findThreadLatestMessageAtUnscoped({
      connectedAccountId,
      unipileThreadId: chat.id,
    });
    if (latestMessageAt === null) return false;

    return latestMessageAt >= new Date(chat.last_message_timestamp);
  }

  private async pullAndIngestMessages(account: ConnectedAccount, chatId: string): Promise<void> {
    let messages: { message: IngestMessage; raw: UnipileMessage }[];
    try {
      messages = await this.pullLatestMessages(account, chatId);
    } catch (err) {
      if (isUnipileRateLimit(err)) throw err;

      Sentry.captureException(err, {
        tags: {
          unipileAccountId: account.unipileAccountId,
          companyId: account.companyId,
          connectedAccountId: account.id,
          step: "chat-messages",
        },
      });

      return;
    }

    for (const { message, raw } of messages) await this.ingestMessageSafely(account, message, raw);
  }

  private async pullLatestMessages(
    account: ConnectedAccount,
    chatId: string,
  ): Promise<{ message: IngestMessage; raw: UnipileMessage }[]> {
    const raws: unknown[] = [];

    await paginateStep({
      startCursor: null,
      limit: UNIPILE_MAX_LIMIT,
      maxPages: BACKFILL_MESSAGE_PAGE_BUDGET,
      fetchPage: (query) =>
        this.messagingService.listChatMessages({
          accountId: account.unipileAccountId,
          chatId,
          limit: UNIPILE_MAX_LIMIT,
          cursor: query.cursor,
          offset: query.offset,
          timeoutMs: BACKFILL_MESSAGE_TIMEOUT_MS,
        }),
      handleItem: (raw) => {
        raws.push(raw);

        return Promise.resolve();
      },
    });

    const messages: { message: IngestMessage; raw: UnipileMessage }[] = [];
    for (const raw of raws) {
      const parsed = UnipileMessageSchema.safeParse(raw);

      if (!parsed.success) {
        await this.repo.recordUnusableItemUnscoped({
          companyId: account.companyId,
          connectedAccountId: account.id,
          payload: raw,
        });

        continue;
      }

      const normalized = normalizeChatMessage(parsed.data, account.provider);

      if (!normalized) {
        if (isExcludedChatId(parsed.data.chat_id)) continue;

        await this.repo.recordUnusableItemUnscoped({
          companyId: account.companyId,
          connectedAccountId: account.id,
          payload: parsed.data,
          unipileMessageId: parsed.data.id,
        });

        continue;
      }

      messages.push({ message: normalized, raw: parsed.data });
    }

    return messages;
  }

  private async ingestMessageSafely(
    account: ConnectedAccount,
    message: IngestMessage,
    raw: UnipileMessage,
  ): Promise<void> {
    try {
      await this.ingest.ingestMessageUnscoped({
        companyId: account.companyId,
        connectedAccountId: account.id,
        message,
        backfill: true,
      });
    } catch (err) {
      Sentry.captureException(err, {
        tags: {
          unipileAccountId: account.unipileAccountId,
          companyId: account.companyId,
          connectedAccountId: account.id,
          step: "message",
        },
      });
      await this.repo.recordUnusableItemUnscoped({
        companyId: account.companyId,
        connectedAccountId: account.id,
        payload: raw,
        unipileMessageId: message.unipileMessageId,
      });
    }
  }

  private async resolveParticipants(
    account: ConnectedAccount,
    chat: UnipileChat,
    opts: { allowFetch: boolean },
  ): Promise<MessagingAttendee[]> {
    if (chat.is_group) {
      const inline = (chat.participants ?? [])
        .filter((p) => p.is_self !== true)
        .map((p) => mapUnipileUser(p.user, { isSelf: false }));

      if (inline.length) return inline;

      if (opts.allowFetch) return this.fetchParticipants(account, chat.id);

      return [];
    }

    if (!chat.user) return [];

    const attendee = mapUnipileUser(chat.user);

    return [{ ...attendee, isSelf: isSelfAccount(account, attendee.identifier) }];
  }

  private async fetchParticipants(account: ConnectedAccount, chatId: string): Promise<MessagingAttendee[]> {
    const participants: MessagingAttendee[] = [];

    try {
      await paginateStep({
        startCursor: null,
        limit: UNIPILE_MAX_LIMIT,
        fetchPage: (query) =>
          this.messagingService.listChatParticipants({
            accountId: account.unipileAccountId,
            chatId,
            limit: UNIPILE_MAX_LIMIT,
            cursor: query.cursor,
            offset: query.offset,
          }),
        handleItem: (raw) => {
          const attendee = mapParticipantRecord(raw);
          if (attendee) participants.push(attendee);

          return Promise.resolve();
        },
      });
    } catch (err) {
      if (isUnipileRateLimit(err)) throw err;

      Sentry.captureException(err, {
        tags: {
          unipileAccountId: account.unipileAccountId,
          companyId: account.companyId,
          connectedAccountId: account.id,
          step: "chat",
        },
      });
    }

    return participants;
  }
}
