import type { MessagingService } from "../messaging.service";
import type { IngestMessage, MessagingAttendee } from "../messaging.schema";
import type { ChatSenderLookup } from "../chat-normalize";
import type { MessagingProvider } from "@/generated/prisma";
import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";
import * as Sentry from "@sentry/node";

import { Action, Resource } from "@/generated/prisma";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";

import { UNIPILE_MAX_LIMIT, paginate } from "../ingest/backfill/paginate";
import { UnipileChatAttendeeSchema, UnipileChatMessageSchema } from "../unipile.schema";
import { indexAttendee, mapUnipileChatAttendee, normalizeChatMessage } from "../chat-normalize";

const Schema = z.object({ threadId: z.uuid() });
type ResyncThreadData = Data<typeof Schema>;

type ResyncThreadResult = { fetched: boolean; participantCount: number; messageCount: number };

export abstract class ResyncThreadRepo {
  abstract findThreadForResyncOrThrow(threadId: string): Promise<{
    id: string;
    unipileThreadId: string;
    connectedAccountId: string;
    provider: MessagingProvider;
    companyId: string;
  }>;
  abstract syncThreadParticipants(args: {
    messagingThreadId: string;
    companyId: string;
    provider: MessagingProvider;
    participants: MessagingAttendee[];
  }): Promise<void>;
  abstract ingestMessage(args: {
    companyId: string;
    connectedAccountId: string;
    message: IngestMessage;
    backfill?: boolean;
  }): Promise<unknown>;
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

    const lookup: ChatSenderLookup = { byKey: new Map(), selfAttendeeId: null, selfSender: undefined };

    try {
      const participantCount = await this.refreshParticipants(thread, lookup);
      const messageCount = await this.refreshMessages(thread, lookup);

      return { ok: true as const, data: { fetched: true, participantCount, messageCount } };
    } catch (err) {
      Sentry.captureException(err);

      return { ok: true as const, data: { fetched: false, participantCount: 0, messageCount: 0 } };
    }
  }

  private async refreshParticipants(
    thread: Awaited<ReturnType<ResyncThreadRepo["findThreadForResyncOrThrow"]>>,
    lookup: ChatSenderLookup,
  ): Promise<number> {
    const participants: MessagingAttendee[] = [];

    await paginate({
      budget: Number.POSITIVE_INFINITY,
      fetchPage: (cursor) =>
        this.messagingService.listChatAttendees({ chatId: thread.unipileThreadId, limit: UNIPILE_MAX_LIMIT, cursor }),
      handleItem: (raw) => {
        const parsed = UnipileChatAttendeeSchema.safeParse(raw);
        if (parsed.success) {
          indexAttendee(lookup, parsed.data);
          if (parsed.data.is_self !== true) participants.push(mapUnipileChatAttendee(parsed.data));
        }

        return Promise.resolve(1);
      },
    });

    if (participants.length > 0) {
      await this.repo.syncThreadParticipants({
        messagingThreadId: thread.id,
        companyId: thread.companyId,
        provider: thread.provider,
        participants,
      });
    }

    return participants.length;
  }

  private async refreshMessages(
    thread: Awaited<ReturnType<ResyncThreadRepo["findThreadForResyncOrThrow"]>>,
    lookup: ChatSenderLookup,
  ): Promise<number> {
    let messageCount = 0;

    await paginate({
      fetchPage: (cursor) =>
        this.messagingService.listChatMessages({ chatId: thread.unipileThreadId, limit: UNIPILE_MAX_LIMIT, cursor }),
      handleItem: async (raw) => {
        const parsed = UnipileChatMessageSchema.safeParse(raw);
        if (!parsed.success) return 1;

        const normalized = normalizeChatMessage(parsed.data, lookup, thread.provider);
        if (!normalized) return 1;

        try {
          await this.repo.ingestMessage({
            companyId: thread.companyId,
            connectedAccountId: thread.connectedAccountId,
            message: normalized,
            backfill: true,
          });
          messageCount += 1;
        } catch (err) {
          Sentry.captureException(err);
        }

        return 1;
      },
    });

    return messageCount;
  }
}
