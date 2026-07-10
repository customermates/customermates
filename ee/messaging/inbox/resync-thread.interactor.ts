import type { MessagingService } from "../messaging.service";
import type { IngestMessage, MessagingAttendee } from "../messaging.schema";
import type { MessagingProvider } from "@/generated/prisma";
import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";
import * as Sentry from "@sentry/node";
import { getLocale } from "next-intl/server";

import { Action, Resource, MessagingThreadType } from "@/generated/prisma";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";

import { UNIPILE_MAX_LIMIT, paginateStep } from "../ingest/backfill/paginate";
import { mapParticipantRecord, normalizeChatMessage } from "../chat-normalize";
import { buildEmailMessage } from "../unipile.mappers";
import { UnipileMessageSchema, UnipileEmailSchema } from "../unipile.schema";
import { isEmailProvider } from "../provider";
import { isUnipileRateLimit, getRetryAfterSeconds } from "../messaging.service";
import { formatRetryAfter } from "../retry-after";

const Schema = z.object({ threadId: z.uuid() });
type ResyncThreadData = Data<typeof Schema>;

type ResyncThreadResult = {
  fetched: boolean;
  participantCount: number;
  messageCount: number;
  rateLimited?: boolean;
  retryAfter?: string;
};

type ResyncThread = {
  id: string;
  unipileThreadId: string;
  connectedAccountId: string;
  provider: MessagingProvider;
  type: MessagingThreadType;
  companyId: string;
  unipileAccountId: string;
  emailAddress: string | null;
  sentFolderIds: string[];
};

export abstract class ResyncThreadRepo {
  abstract findThreadForResyncOrThrow(threadId: string): Promise<ResyncThread>;
  abstract upsertThreadParticipantsUnscoped(args: {
    messagingThreadId: string;
    companyId: string;
    provider: MessagingProvider;
    participants: MessagingAttendee[];
  }): Promise<void>;
  abstract ingestMessageUnscoped(args: {
    companyId: string;
    connectedAccountId: string;
    message: IngestMessage;
    backfill?: boolean;
  }): Promise<unknown>;
  abstract recordUnusableItemUnscoped(args: {
    companyId: string;
    connectedAccountId: string;
    payload: unknown;
    unipileMessageId?: string | null;
  }): Promise<void>;
}

@TenantInteractor({ resource: Resource.inboxMessages, action: Action.update })
export class ResyncThreadInteractor extends AuthenticatedInteractor<ResyncThreadData, ResyncThreadResult> {
  constructor(
    private repo: ResyncThreadRepo,
    private messagingService: MessagingService,
  ) {
    super();
  }

  @Enforce(Schema)
  async invoke(data: ResyncThreadData): Promise<{ ok: true; data: ResyncThreadResult }> {
    const thread = await this.repo.findThreadForResyncOrThrow(data.threadId);

    try {
      const participantCount =
        !isEmailProvider(thread.provider) && thread.type === MessagingThreadType.group
          ? await this.refreshParticipants(thread)
          : 0;
      const messageCount = await this.pullMessages(thread);

      return { ok: true as const, data: { fetched: true, participantCount, messageCount } };
    } catch (err) {
      const rateLimited = isUnipileRateLimit(err);

      if (!rateLimited) {
        Sentry.captureException(err, {
          tags: {
            unipileAccountId: thread.unipileAccountId,
            companyId: thread.companyId,
            connectedAccountId: thread.connectedAccountId,
          },
        });
      }

      const retryAfter = rateLimited ? formatRetryAfter(await getLocale(), getRetryAfterSeconds(err)) : undefined;

      return {
        ok: true as const,
        data: { fetched: false, participantCount: 0, messageCount: 0, rateLimited, retryAfter },
      };
    }
  }

  private async refreshParticipants(thread: ResyncThread): Promise<number> {
    const participants: MessagingAttendee[] = [];

    try {
      await paginateStep({
        startCursor: null,
        limit: UNIPILE_MAX_LIMIT,
        fetchPage: (query) =>
          this.messagingService.listChatParticipants({
            accountId: thread.unipileAccountId,
            chatId: thread.unipileThreadId,
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
      Sentry.captureException(err, {
        tags: {
          unipileAccountId: thread.unipileAccountId,
          companyId: thread.companyId,
          connectedAccountId: thread.connectedAccountId,
        },
      });

      return 0;
    }

    if (participants.length > 0) {
      await this.repo.upsertThreadParticipantsUnscoped({
        messagingThreadId: thread.id,
        companyId: thread.companyId,
        provider: thread.provider,
        participants,
      });
    }

    return participants.length;
  }

  private async pullMessages(thread: ResyncThread): Promise<number> {
    return isEmailProvider(thread.provider) ? this.pullEmailMessages(thread) : this.pullChatMessages(thread);
  }

  private async pullChatMessages(thread: ResyncThread): Promise<number> {
    let messageCount = 0;

    await paginateStep({
      startCursor: null,
      limit: UNIPILE_MAX_LIMIT,
      fetchPage: (query) =>
        this.messagingService.listChatMessages({
          accountId: thread.unipileAccountId,
          chatId: thread.unipileThreadId,
          limit: UNIPILE_MAX_LIMIT,
          cursor: query.cursor,
          offset: query.offset,
        }),
      handleItem: async (raw) => {
        const parsed = UnipileMessageSchema.safeParse(raw);

        if (!parsed.success) {
          await this.repo.recordUnusableItemUnscoped({
            companyId: thread.companyId,
            connectedAccountId: thread.connectedAccountId,
            payload: raw,
          });

          return;
        }

        const normalized = normalizeChatMessage(parsed.data, thread.provider);

        if (!normalized) {
          await this.repo.recordUnusableItemUnscoped({
            companyId: thread.companyId,
            connectedAccountId: thread.connectedAccountId,
            payload: parsed.data,
            unipileMessageId: parsed.data.id,
          });

          return;
        }

        if (await this.ingestSafely(thread, normalized, parsed.data)) messageCount += 1;
      },
    });

    return messageCount;
  }

  private async pullEmailMessages(thread: ResyncThread): Promise<number> {
    const { emails } = await this.messagingService.getThread({
      accountId: thread.unipileAccountId,
      threadId: thread.unipileThreadId,
    });

    let messageCount = 0;

    for (const raw of emails) {
      const parsed = UnipileEmailSchema.safeParse(raw);

      if (!parsed.success) {
        await this.repo.recordUnusableItemUnscoped({
          companyId: thread.companyId,
          connectedAccountId: thread.connectedAccountId,
          payload: raw,
        });

        continue;
      }

      const normalized = buildEmailMessage(parsed.data, {
        provider: thread.provider,
        emailAddress: thread.emailAddress,
        sentFolderIds: thread.sentFolderIds,
      });

      if (!normalized) {
        await this.repo.recordUnusableItemUnscoped({
          companyId: thread.companyId,
          connectedAccountId: thread.connectedAccountId,
          payload: parsed.data,
          unipileMessageId: parsed.data.id,
        });

        continue;
      }

      if (await this.ingestSafely(thread, normalized, parsed.data)) messageCount += 1;
    }

    return messageCount;
  }

  private async ingestSafely(thread: ResyncThread, message: IngestMessage, raw: unknown): Promise<boolean> {
    try {
      await this.repo.ingestMessageUnscoped({
        companyId: thread.companyId,
        connectedAccountId: thread.connectedAccountId,
        message,
        backfill: true,
      });

      return true;
    } catch (err) {
      Sentry.captureException(err, {
        tags: {
          unipileAccountId: thread.unipileAccountId,
          companyId: thread.companyId,
          connectedAccountId: thread.connectedAccountId,
        },
      });
      await this.repo.recordUnusableItemUnscoped({
        companyId: thread.companyId,
        connectedAccountId: thread.connectedAccountId,
        payload: raw,
        unipileMessageId: message.unipileMessageId,
      });

      return false;
    }
  }
}
