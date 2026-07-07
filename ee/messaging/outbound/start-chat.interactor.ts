import type { Data, Validated } from "@/core/validation/validation.utils";

import type { ConnectedAccount } from "@/generated/prisma";
import type { IngestMessage, MessagingAttendee, MessagingMessage } from "../messaging.schema";
import type { MessagingService } from "../messaging.service";

import { z } from "zod";
import { randomUUID } from "node:crypto";
import { getLocale, getTranslations } from "next-intl/server";
import * as Sentry from "@sentry/node";

import {
  Resource,
  Action,
  MessagingMessageDirection,
  MessagingMessageOrigin,
  MessagingProvider,
  MessagingThreadType,
} from "@/generated/prisma";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { createZodError } from "@/core/validation/validation.utils";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { normalizeChannelValue } from "@/features/contacts/channel-value";
import { isHandleProvider } from "../provider";
import { formatRetryAfter } from "../retry-after";
import { EMPTY_ATTENDEE, buildChatAttendee } from "../unipile.mappers";
import { UnipileInboxSchema } from "../unipile.schema";
import { SendAttachmentSchema } from "./send-email.interactor";

import type { FindUsableAccountRepo } from "../persistence/find-usable-account.repo";

export const BaseStartChatInputSchema = z.object({
  connectedAccountId: z.uuid(),
  attendeeIdentifiers: z.array(z.string().min(1)).min(1),
  text: z.string().max(20_000),
  subject: z.string().max(998).optional(),
  attachments: z.array(SendAttachmentSchema).max(20).optional(),
});

export const StartChatInputSchema = BaseStartChatInputSchema.superRefine((d, ctx) => {
  if (!d.text.trim() && !d.attachments?.length) {
    ctx.addIssue({
      code: "custom",
      params: { error: CustomErrorCode.messageContentRequired },
      path: ["text"],
    });
  }
});

export type StartChatData = Data<typeof StartChatInputSchema>;

export type StartChatResult = { threadId: string | null };

export abstract class StartChatContactRepo {
  abstract findContactChannelCompanyWide(args: {
    provider: MessagingProvider;
    identifier: string;
  }): Promise<{ id: string; messagingId: string | null; displayName: string | null; profileUrl: string | null } | null>;
  abstract saveResolvedContactChannel(args: {
    id: string;
    messagingId: string;
    displayName: string | null;
    profileUrl: string | null;
  }): Promise<void>;
}

export abstract class StartChatThreadRepo {
  abstract persistOutboundMessageOrThrow(args: {
    connectedAccountId: string;
    message: IngestMessage;
  }): Promise<MessagingMessage>;
}

type ResolvedAttendees =
  | { ok: true; ids: string[]; attendees: MessagingAttendee[] }
  | { ok: false; error: string; retryAfterSeconds?: number };

const PRIMARY_INBOX_ID = "CLASSIC_PRIMARY";

@TenantInteractor({ resource: Resource.inboxMessages, action: Action.create })
export class StartChatInteractor extends AuthenticatedInteractor<StartChatData, StartChatResult> {
  constructor(
    private accountRepo: FindUsableAccountRepo,
    private contactRepo: StartChatContactRepo,
    private messagingService: MessagingService,
    private threadRepo: StartChatThreadRepo,
  ) {
    super();
  }

  @Write({
    input: StartChatInputSchema,
    precheck: (self, data, ctx) => self.precheck(data, ctx),
    tx: false,
  })
  async invoke(data: StartChatData): Validated<StartChatResult> {
    const account = await this.accountRepo.findUsableAccountByIdOrThrow(data.connectedAccountId);

    const attendees = isHandleProvider(account.provider)
      ? await this.resolveAttendees(account, data.attendeeIdentifiers)
      : this.plainAttendees(data.attendeeIdentifiers);

    if (!attendees.ok) {
      const t = await getTranslations();
      return {
        ok: false,
        error: createZodError<StartChatResult>(
          t(`Common.errors.${attendees.error}`, {
            retryAfter: formatRetryAfter(await getLocale(), attendees.retryAfterSeconds),
          }),
        ),
      };
    }

    const res = await this.messagingService.startChat({
      accountId: account.unipileAccountId,
      usersIds: attendees.ids,
      text: data.text,
      name: data.subject,
      attachments: data.attachments,
      inboxId: await this.resolveInboxId(account),
    });

    if (!res.ok) {
      const t = await getTranslations();
      return {
        ok: false,
        error: createZodError<StartChatResult>(
          t(`Common.errors.${res.error}`, { retryAfter: formatRetryAfter(await getLocale(), res.retryAfterSeconds) }),
        ),
      };
    }

    if (!res.data.chatId) return { ok: true as const, data: { threadId: null } };

    try {
      const persisted = await this.threadRepo.persistOutboundMessageOrThrow({
        connectedAccountId: account.id,
        message: {
          unipileMessageId: res.data.messageId ?? `sent_${randomUUID()}`,
          providerMessageId: null,
          provider: account.provider,
          direction: MessagingMessageDirection.outbound,
          origin: MessagingMessageOrigin.unipile,
          sender: { ...EMPTY_ATTENDEE, displayName: account.displayName, isSelf: true },
          recipients: { to: attendees.attendees, cc: [], bcc: [] },
          subject: data.subject ?? null,
          bodyText: data.text,
          bodyHtml: null,
          attachmentsMeta: [],
          isEvent: false,
          isDeleted: false,
          isHidden: false,
          sentAt: new Date(),
          reactions: [],
          unipileThreadId: res.data.chatId,
          threadType: attendees.attendees.length > 1 ? MessagingThreadType.group : MessagingThreadType.single,
        },
      });

      return { ok: true as const, data: { threadId: persisted.messagingThreadId } };
    } catch (err) {
      Sentry.captureException(err);
      return { ok: true as const, data: { threadId: null } };
    }
  }

  private async precheck(data: StartChatData, ctx: z.RefinementCtx) {
    const account = await this.accountRepo.findUsableAccountByIdOrThrow(data.connectedAccountId);
    data.attendeeIdentifiers.forEach((raw, index) => {
      const normalized = normalizeChannelValue(account.provider, raw);
      if (!normalized) {
        ctx.addIssue({
          code: "custom",
          params: { error: CustomErrorCode.invalidChannelValue },
          path: ["attendeeIdentifiers", index],
        });
        return;
      }
      data.attendeeIdentifiers[index] = normalized;
    });
  }

  private async resolveInboxId(account: ConnectedAccount): Promise<string | undefined> {
    if (account.provider !== MessagingProvider.linkedin) return undefined;

    const items = await this.messagingService
      .listInboxes({ accountId: account.unipileAccountId })
      .then((page) => page.data ?? [])
      .catch(() => [] as unknown[]);

    const inboxIds: string[] = [];
    for (const raw of items) {
      const parsed = UnipileInboxSchema.safeParse(raw);
      if (parsed.success && parsed.data.disabled !== true) inboxIds.push(parsed.data.id);
    }

    return inboxIds.find((id) => id === PRIMARY_INBOX_ID) ?? inboxIds.sort()[0];
  }

  private plainAttendees(identifiers: string[]): ResolvedAttendees {
    return {
      ok: true,
      ids: identifiers,
      attendees: identifiers.map((identifier) =>
        buildChatAttendee({
          id: identifier,
          name: null,
          phone: identifier,
          publicIdentifier: null,
          providerId: null,
          pictureUrl: null,
          profileUrl: null,
          headline: null,
          occupation: null,
        }),
      ),
    };
  }

  private async resolveAttendees(account: ConnectedAccount, identifiers: string[]): Promise<ResolvedAttendees> {
    const ids: string[] = [];
    const attendees: MessagingAttendee[] = [];

    for (const identifier of identifiers) {
      const channel = await this.contactRepo.findContactChannelCompanyWide({ provider: account.provider, identifier });

      if (channel?.messagingId) {
        ids.push(channel.messagingId);
        attendees.push(
          buildChatAttendee({
            id: channel.messagingId,
            name: channel.displayName,
            phone: null,
            publicIdentifier: null,
            providerId: channel.messagingId,
            pictureUrl: null,
            profileUrl: channel.profileUrl,
            headline: null,
            occupation: null,
          }),
        );
        continue;
      }

      const res = await this.messagingService.getProviderProfile({
        accountId: account.unipileAccountId,
        identifier,
      });
      if (!res.ok) return { ok: false, error: res.error, retryAfterSeconds: res.retryAfterSeconds };

      if (channel) {
        await this.contactRepo.saveResolvedContactChannel({
          id: channel.id,
          messagingId: res.data.providerId,
          displayName: res.data.displayName,
          profileUrl: res.data.profileUrl,
        });
      }

      ids.push(res.data.providerId);
      attendees.push(
        buildChatAttendee({
          id: res.data.providerId,
          name: res.data.displayName,
          phone: null,
          publicIdentifier: res.data.publicIdentifier,
          providerId: res.data.providerId,
          pictureUrl: res.data.pictureUrl,
          profileUrl: res.data.profileUrl,
          headline: res.data.headline,
          occupation: null,
        }),
      );
    }

    return { ok: true, ids, attendees };
  }
}
