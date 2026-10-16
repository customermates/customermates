import type { StartChatThreadRepo } from "./start-chat-thread.repo";
import type { StartChatContactChannel, StartChatContactRepo } from "./start-chat-contact.repo";
import type { RecordIdentityReader } from "@/features/records/record-identity-reader";
import { fail, failConflict } from "@/core/validation/interactor-failure-server";
import type { Data, Validated } from "@/core/validation/validation.utils";

import type { EntitlementService } from "@/ee/subscription/entitlement.service";
import type { ConnectedAccount } from "@/generated/prisma";
import type { MessagingAttendee } from "../messaging.schema";
import type { MessagingService, StartChatSpecifics } from "../messaging.service";

import * as Sentry from "@sentry/node";
import { randomUUID } from "node:crypto";
import { z } from "zod";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { normalizeChannelValue } from "@/features/records/channel-value";
import {
  MessagingMessageDirection,
  MessagingMessageOrigin,
  MessagingProvider,
  MessagingThreadType,
  Resource,
} from "@/generated/prisma";
import {
  DraftRevisionSchema,
  draftBindingConflict,
  draftUpdatedAtFromRevision,
  hasCompleteDraftBinding,
} from "../draft-thread";
import { DRAFT_CONFLICT_CODES, providerSendOutcome, type DraftSendClaim } from "../draft-send";
import { LINKEDIN_PRODUCTS, LINKEDIN_PRODUCT_PRIMARY_INBOX, isHandleProvider, type LinkedinProduct } from "../provider";
import { retryAfterPhrase } from "../retry-after.server";
import { EMPTY_ATTENDEE, buildChatAttendee } from "../unipile.mappers";
import { UnipileInboxSchema } from "../unipile.schema";
import { SendAttachmentSchema } from "./send-email.interactor";
import {
  chatSendContentHash,
  completeDraftSendQuietly,
  gateMissingDraft,
  openDraftSend,
  recordDraftSendQuietly,
  releaseDraftSendQuietly,
  settleDraftSendQuietly,
} from "./draft-send-gate";

import type { FindUsableAccountRepo } from "../persistence/find-usable-account.repo";
import { accountNeedsReconnect } from "../account-health";
import { identityLookupValue } from "../identity-lookup";

const LinkedinProductSchema = z.enum(LINKEDIN_PRODUCTS);

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
  draftMessageId: z
    .uuid()
    .optional()
    .describe(
      "Saved new-conversation draft to send. Each draft revision is sent at most once: repeating the call returns the first result",
    ),
  draftRevision: DraftRevisionSchema.optional().describe(
    "Opaque revision returned with the saved draft; required whenever draftMessageId is provided",
  ),
});

export const StartChatInputSchema = BaseStartChatInputSchema.superRefine((d, ctx) => {
  if (!hasCompleteDraftBinding(d)) {
    ctx.addIssue({
      code: "custom",
      params: { error: CustomErrorCode.draftMessageNotFound },
      path: [d.draftMessageId ? "draftRevision" : "draftMessageId"],
    });
  }
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

export type StartChatResult = { threadId: string | null; messageId: string | null; repeated: boolean };

type ResolvedAttendees =
  | { ok: true; ids: string[]; attendees: MessagingAttendee[] }
  | { ok: false; error: CustomErrorCode; retryAfterSeconds?: number };

const PRODUCT_LABEL: Record<LinkedinProduct, string> = {
  classic: "Classic",
  sales_navigator: "Sales Navigator",
  recruiter: "Recruiter",
};

@TenantInteractor({ resource: Resource.inboxMessages, manage: "create" })
export class StartChatInteractor extends AuthenticatedInteractor<StartChatData, StartChatResult> {
  constructor(
    private accountRepo: FindUsableAccountRepo,
    private contactRepo: StartChatContactRepo,
    private messagingService: MessagingService,
    private threadRepo: StartChatThreadRepo,
    private entitlements: EntitlementService,
    private identities: Pick<RecordIdentityReader, "resolve">,
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
    if (accountNeedsReconnect(account)) return fail(CustomErrorCode.unipileDisconnectedAccount, []);

    const draft =
      data.draftMessageId && data.draftRevision
        ? await this.threadRepo.findDraftById({ messageId: data.draftMessageId })
        : null;
    const contentHash = data.draftMessageId
      ? chatSendContentHash({ text: data.text, attachments: data.attachments })
      : "";
    if (data.draftMessageId && data.draftRevision) {
      if (!draft) {
        const missing = await gateMissingDraft(this.threadRepo, {
          draftMessageId: data.draftMessageId,
          draftRevision: draftUpdatedAtFromRevision(data.draftRevision),
          connectedAccountId: account.id,
          contentHash,
        });
        if ("failure" in missing) return missing.failure;
        return {
          ok: true as const,
          data: { threadId: missing.replay.sentThreadId, messageId: missing.replay.sentMessageId, repeated: true },
        };
      }
      const conflict = draftBindingConflict({
        provider: account.provider,
        draft,
        connectedAccountId: account.id,
        draftRevision: data.draftRevision,
        replyThreadId: null,
        to: data.attendeeIdentifiers,
      });
      if (conflict) return failConflict(DRAFT_CONFLICT_CODES[conflict]);
    }

    let claim: DraftSendClaim | null = null;
    if (draft && data.draftRevision) {
      const gate = await openDraftSend(this.threadRepo, {
        draftMessageId: draft.id,
        draftRevision: draftUpdatedAtFromRevision(data.draftRevision),
        connectedAccountId: account.id,
        contentHash,
      });
      if ("replay" in gate) {
        return {
          ok: true as const,
          data: { threadId: gate.replay.sentThreadId, messageId: gate.replay.sentMessageId, repeated: true },
        };
      }
      if ("failure" in gate) return gate.failure;
      claim = gate.claim;
    }

    const product = data.linkedinProduct ?? "classic";
    let attendees: ResolvedAttendees;
    let inboxId: string | undefined;
    try {
      attendees = isHandleProvider(account.provider)
        ? await this.resolveAttendees(account, data.attendeeIdentifiers)
        : this.plainAttendees(data.attendeeIdentifiers);
      inboxId = attendees.ok ? await this.resolveInboxId(account, product) : undefined;
    } catch (err) {
      if (claim) await releaseDraftSendQuietly(this.threadRepo, claim);
      throw err;
    }

    if (!attendees.ok) {
      if (claim) await releaseDraftSendQuietly(this.threadRepo, claim);
      return fail(attendees.error, [], {
        retryAfter: await retryAfterPhrase(attendees.retryAfterSeconds),
      });
    }

    if (account.provider === MessagingProvider.linkedin && product !== "classic" && !inboxId) {
      if (claim) await releaseDraftSendQuietly(this.threadRepo, claim);
      return fail(CustomErrorCode.linkedinInboxUnavailable, [], { product: PRODUCT_LABEL[product] });
    }

    let res: Awaited<ReturnType<MessagingService["startChat"]>>;
    try {
      res = await this.messagingService.startChat({
        accountId: account.unipileAccountId,
        usersIds: attendees.ids,
        text: data.text,
        name: data.chatName,
        attachments: data.attachments,
        inboxId,
        specifics: this.buildSpecifics(data),
      });
    } catch (err) {
      if (claim) await settleDraftSendQuietly(this.threadRepo, { claim, state: "unknown" });
      throw err;
    }

    const started = res.ok ? res.data : null;
    if (!res.ok && providerSendOutcome(res.error) !== "accepted") {
      if (claim) {
        if (providerSendOutcome(res.error) === "unknown")
          await settleDraftSendQuietly(this.threadRepo, { claim, state: "unknown" });
        else await releaseDraftSendQuietly(this.threadRepo, claim);
      }
      return fail(res.error, [], { retryAfter: await retryAfterPhrase(res.retryAfterSeconds) });
    }

    if (claim && draft) {
      await completeDraftSendQuietly(this.threadRepo, {
        claim,
        draftMessageId: draft.id,
        unipileMessageId: started?.messageId ?? null,
        providerMessageId: null,
      });
    }

    let threadId: string | null = null;
    let messageId: string | null = null;

    if (started?.chatId) {
      try {
        const persisted = await this.threadRepo.persistOutboundMessageOrThrow({
          connectedAccountId: account.id,
          message: {
            unipileMessageId: started.messageId ?? `sent_${randomUUID()}`,
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
            unipileThreadId: started.chatId,
            threadType: attendees.attendees.length > 1 ? MessagingThreadType.group : MessagingThreadType.single,
          },
        });
        threadId = persisted.messagingThreadId;
        messageId = persisted.id;
        if (claim) await recordDraftSendQuietly(this.threadRepo, claim, persisted);
      } catch (err) {
        Sentry.captureException(err);
      }
    }

    return { ok: true as const, data: { threadId, messageId, repeated: false } };
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

  private findContactChannel(provider: MessagingProvider, identifier: string) {
    return runInTransaction(
      async (): Promise<StartChatContactChannel | null> => {
        const value = identityLookupValue(provider, identifier);
        if (!value) return null;
        const matches = await this.identities.resolve([{ provider, value }]);
        const ids = new Set(
          matches.flatMap((match) => match.records.flatMap((record) => (record.identityId ? [record.identityId] : []))),
        );
        if (ids.size !== 1) return null;
        return (
          (await this.contactRepo.findIdentityChannelsCompanyWide(provider, value)).find((row) => ids.has(row.id)) ??
          null
        );
      },
      { readOnly: true },
    );
  }

  private async saveResolvedContactChannel(args: {
    id: string;
    messagingId: string;
    displayName: string | null;
    profileUrl: string | null;
  }): Promise<void> {
    await runInTransaction(async () => {
      if (await this.contactRepo.isRecordWritePaused()) return;
      const identity = await this.contactRepo.findIdentityCompanyWide(args.id);
      if (!identity) return;
      const matches = await this.identities.resolve([{ provider: identity.provider, value: identity.value }]);
      for (const reference of matches.flatMap((match) => match.records)) {
        if (!reference.canEdit || !(await this.contactRepo.isRecordEditableCompanyWide(reference.ref))) continue;
        await this.contactRepo.setIdentityResolutionCompanyWide(args.id, {
          messagingId: args.messagingId,
          displayName: args.displayName,
          profileUrl: args.profileUrl,
        });
        return;
      }
    });
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
      const channel = await this.findContactChannel(account.provider, identifier);

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
        await this.saveResolvedContactChannel({
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
