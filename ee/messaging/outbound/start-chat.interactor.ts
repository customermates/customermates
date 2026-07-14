import type { Data, Validated } from "@/core/validation/validation.utils";

import type { ConnectedAccount } from "@/generated/prisma";
import type { IngestMessage, MessagingAttendee, MessagingMessage } from "../messaging.schema";
import type { MessagingService, StartChatSpecifics } from "../messaging.service";
import type { EntitlementService } from "@/ee/subscription/entitlement.service";

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
import { LINKEDIN_PRODUCTS, LINKEDIN_PRODUCT_PRIMARY_INBOX, isHandleProvider, type LinkedinProduct } from "../provider";
import { formatRetryAfter } from "../retry-after";
import { EMPTY_ATTENDEE, buildChatAttendee } from "../unipile.mappers";
import { UnipileInboxSchema } from "../unipile.schema";
import { SendAttachmentSchema } from "./send-email.interactor";

import type { FindUsableAccountRepo } from "../persistence/find-usable-account.repo";

export const LinkedinProductSchema = z.enum(LINKEDIN_PRODUCTS);

export const BaseStartChatInputSchema = z.object({
  connectedAccountId: z.uuid(),
  attendeeIdentifiers: z.array(z.string().min(1)).min(1),
  text: z.string().max(20_000),
  chatName: z.string().max(998).optional().describe("Optional display name for the new chat (group chats)"),
  linkedinProduct: LinkedinProductSchema.optional().describe(
    "LinkedIn only: which product to send from. classic (default), sales_navigator or recruiter start the chat from that product's inbox; the two latter send an InMail and require inmailSubject (recruiter also inmailSignature)",
  ),
  inmail: z
    .boolean()
    .optional()
    .describe("LinkedIn classic only: send as InMail to message people outside your network (uses InMail credit)"),
  inmailSubject: z
    .string()
    .max(998)
    .optional()
    .describe("Subject line of the InMail. Required for sales_navigator and recruiter"),
  inmailSignature: z.string().max(998).optional().describe("Sender signature. Required for recruiter"),
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
  if ((d.linkedinProduct === "sales_navigator" || d.linkedinProduct === "recruiter") && !d.inmailSubject?.trim()) {
    ctx.addIssue({
      code: "custom",
      params: { error: CustomErrorCode.inmailSubjectRequired },
      path: ["inmailSubject"],
    });
  }
  if (d.linkedinProduct === "recruiter" && !d.inmailSignature?.trim()) {
    ctx.addIssue({
      code: "custom",
      params: { error: CustomErrorCode.inmailSignatureRequired },
      path: ["inmailSignature"],
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

const PRODUCT_LABEL: Record<LinkedinProduct, string> = {
  classic: "Classic",
  sales_navigator: "Sales Navigator",
  recruiter: "Recruiter",
};

@TenantInteractor({ resource: Resource.inboxMessages, action: Action.create })
export class StartChatInteractor extends AuthenticatedInteractor<StartChatData, StartChatResult> {
  constructor(
    private accountRepo: FindUsableAccountRepo,
    private contactRepo: StartChatContactRepo,
    private messagingService: MessagingService,
    private threadRepo: StartChatThreadRepo,
    private entitlements: EntitlementService,
  ) {
    super();
  }

  @Write({
    input: StartChatInputSchema,
    precheck: (self, data, ctx) => self.precheck(data, ctx),
    tx: false,
  })
  async invoke(data: StartChatData): Validated<StartChatResult> {
    const denied = await this.entitlements.require("messaging");
    if (denied) return denied;

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

    const product = data.linkedinProduct ?? "classic";
    const inboxId = await this.resolveInboxId(account, product);

    if (account.provider === MessagingProvider.linkedin && product !== "classic" && !inboxId) {
      const t = await getTranslations();
      return {
        ok: false,
        error: createZodError<StartChatResult>(
          t("Common.errors.linkedinInboxUnavailable", { product: PRODUCT_LABEL[product] }),
        ),
      };
    }

    const res = await this.messagingService.startChat({
      accountId: account.unipileAccountId,
      usersIds: attendees.ids,
      text: data.text,
      name: data.chatName,
      attachments: data.attachments,
      inboxId,
      specifics: this.buildSpecifics(data),
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
          subject: product === "classic" ? null : (data.inmailSubject ?? null),
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
    if (account.provider !== MessagingProvider.linkedin) {
      if (data.linkedinProduct || data.inmail || data.inmailSubject || data.inmailSignature) {
        ctx.addIssue({
          code: "custom",
          params: { error: CustomErrorCode.linkedinProductRequiresLinkedin },
          path: ["linkedinProduct"],
        });
      }
    } else if (
      data.linkedinProduct &&
      account.linkedinProducts.length > 0 &&
      !account.linkedinProducts.includes(data.linkedinProduct)
    ) {
      ctx.addIssue({
        code: "custom",
        params: { error: CustomErrorCode.linkedinProductUnavailable },
        path: ["linkedinProduct"],
      });
    }
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

  private buildSpecifics(data: StartChatData): StartChatSpecifics | undefined {
    if (data.linkedinProduct === "sales_navigator" && data.inmailSubject)
      return { linkedin: { sales_navigator: { subject: data.inmailSubject } } };

    if (data.linkedinProduct === "recruiter" && data.inmailSubject && data.inmailSignature)
      return { linkedin: { recruiter: { subject: data.inmailSubject, signature: data.inmailSignature } } };

    if (data.inmail) return { linkedin: { classic: { inmail: true } } };

    return undefined;
  }

  private async resolveInboxId(account: ConnectedAccount, product: LinkedinProduct): Promise<string | undefined> {
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

    return inboxIds.find((id) => id === LINKEDIN_PRODUCT_PRIMARY_INBOX[product]);
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
