import type { AttachmentMeta, IngestMessage, MessagingAttendee } from "./messaging.schema";
import type { UnipileAccount, UnipileAttachment, UnipileEmail } from "./unipile.schema";

import {
  ConnectedAccountStatus,
  MessagingMessageDirection,
  MessagingMessageOrigin,
  MessagingProvider,
} from "@/generated/prisma";

import * as Sentry from "@sentry/node";

export const EMPTY_ATTENDEE: MessagingAttendee = {
  attendeeId: "",
  displayName: null,
  identifier: "",
  pictureUrl: null,
  profileUrl: null,
  headline: null,
  occupation: null,
};

const WHATSAPP_JID_DOMAINS = ["@s.whatsapp.net", "@c.us", "@g.us"];

function normalizeAttendeeIdentifier(value: string): string {
  const lower = value.toLowerCase();
  const domain = WHATSAPP_JID_DOMAINS.find((d) => lower.endsWith(d));

  return domain ? value.slice(0, value.length - domain.length).replace(/[^\d]/g, "") : value;
}

function canonicalChatIdentifier(parts: {
  phone?: string | null;
  publicIdentifier?: string | null;
  providerId?: string | null;
  id?: string | null;
}): string {
  const phoneDigits = parts.phone?.replace(/[^\d]/g, "");
  if (phoneDigits) return `+${phoneDigits}`;

  const fallback = parts.publicIdentifier?.trim() || parts.providerId?.trim() || parts.id?.trim() || "";

  return fallback ? normalizeAttendeeIdentifier(fallback) : "";
}

export function attendeePhone(specifics: { phone_number?: string | null } | null | undefined): string | null {
  const phone = specifics?.phone_number;

  return phone && phone !== "hidden" ? phone : null;
}

export function buildChatAttendee(src: {
  id: string | null | undefined;
  name: string | null | undefined;
  phone: string | null | undefined;
  publicIdentifier: string | null | undefined;
  providerId: string | null | undefined;
  pictureUrl: string | null | undefined;
  profileUrl: string | null | undefined;
  headline: string | null | undefined;
  occupation: string | null | undefined;
}): MessagingAttendee {
  return {
    attendeeId: src.id ?? "",
    displayName: src.name ?? null,
    identifier: canonicalChatIdentifier({
      phone: src.phone,
      publicIdentifier: src.publicIdentifier,
      providerId: src.providerId,
      id: src.id,
    }),
    pictureUrl: src.pictureUrl ?? null,
    profileUrl: src.profileUrl ?? null,
    headline: src.headline ?? null,
    occupation: src.occupation ?? null,
  };
}

const PROVIDER_TO_PROVIDER: Record<string, MessagingProvider> = {
  whatsapp: MessagingProvider.whatsapp,
  linkedin: MessagingProvider.linkedin,
  instagram: MessagingProvider.instagram,
  telegram: MessagingProvider.telegram,
  google: MessagingProvider.google,
  outlook: MessagingProvider.outlook,
  imap: MessagingProvider.mail,
  mock: MessagingProvider.mail,
};

export function mapUnipileProvider(provider: string | null | undefined): MessagingProvider {
  if (!provider) return MessagingProvider.mail;
  return PROVIDER_TO_PROVIDER[provider.toLowerCase()] ?? MessagingProvider.mail;
}

const STATUS_TO_DB_STATUS: Record<string, ConnectedAccountStatus> = {
  running: ConnectedAccountStatus.ok,
  paused: ConnectedAccountStatus.stopped,
  errored: ConnectedAccountStatus.error,
  degraded: ConnectedAccountStatus.error,
  disconnected: ConnectedAccountStatus.credentials,
  partial: ConnectedAccountStatus.credentials,
};

export function mapUnipileStatus(status: string | null | undefined): ConnectedAccountStatus {
  if (!status) return ConnectedAccountStatus.connecting;
  return STATUS_TO_DB_STATUS[status.toLowerCase()] ?? ConnectedAccountStatus.connecting;
}

const MESSAGING_PROVIDERS = new Set<MessagingProvider>([
  MessagingProvider.whatsapp,
  MessagingProvider.linkedin,
  MessagingProvider.instagram,
  MessagingProvider.telegram,
  MessagingProvider.mail,
  MessagingProvider.google,
  MessagingProvider.outlook,
]);

const CALENDAR_PROVIDERS = new Set<MessagingProvider>([MessagingProvider.google, MessagingProvider.outlook]);

export function deriveAccountFeatures(account: UnipileAccount): { hasMessaging: boolean; hasCalendar: boolean } {
  const raw = account.provider?.toLowerCase();
  if (!raw || !(raw in PROVIDER_TO_PROVIDER)) {
    Sentry.captureMessage(`Unipile account with unsupported provider "${account.provider}"; skipping backfill`, {
      level: "warning",
      tags: { unipileAccountId: account.id },
    });

    return { hasMessaging: false, hasCalendar: false };
  }

  const provider = mapUnipileProvider(account.provider);

  return {
    hasMessaging: MESSAGING_PROVIDERS.has(provider),
    hasCalendar: CALENDAR_PROVIDERS.has(provider),
  };
}

type EmailAttendee = NonNullable<UnipileEmail["to"]>[number];

function emailAttendee(input: EmailAttendee | null | undefined): MessagingAttendee {
  const identifier = (input?.email ?? "").trim().toLowerCase();
  if (!identifier) return EMPTY_ATTENDEE;

  return {
    ...EMPTY_ATTENDEE,
    attendeeId: identifier,
    displayName: input?.display_name ?? null,
    identifier,
  };
}

function emailRecipients(list: EmailAttendee[] | null | undefined): MessagingAttendee[] {
  return (list ?? []).map(emailAttendee).filter((a) => a.identifier);
}

export function toAttachmentsMeta(attachments: UnipileAttachment[] | null | undefined): AttachmentMeta[] {
  return (attachments ?? []).flatMap((a) =>
    a.id
      ? [
          {
            id: a.id,
            name: a.filename ?? null,
            fileName: a.filename ?? null,
            mime: a.mimetype ?? null,
            size: a.file_size ?? null,
          },
        ]
      : [],
  );
}

export function buildEmailMessage(
  email: UnipileEmail,
  account: { provider: MessagingProvider; emailAddress: string | null; sentFolderIds?: string[] },
): IngestMessage | null {
  const unipileMessageId = email.id;
  if (!unipileMessageId) return null;

  const sentAt = new Date(email.date);
  if (Number.isNaN(sentAt.getTime())) return null;

  const self = account.emailAddress?.trim().toLowerCase() || null;
  const sentFolders = new Set(account.sentFolderIds ?? []);
  const inSentFolder = sentFolders.size > 0 && (email.folders ?? []).some((folderId) => sentFolders.has(folderId));
  const sender = emailAttendee(email.from?.[0]);
  const senderIsSelf = inSentFolder || (self !== null && sender.identifier === self);
  const markSelf = (attendee: MessagingAttendee): MessagingAttendee =>
    self !== null && attendee.identifier === self ? { ...attendee, isSelf: true } : attendee;
  const to = emailRecipients(email.to).map(markSelf);
  const cc = emailRecipients(email.cc).map(markSelf);
  const bcc = emailRecipients(email.bcc).map(markSelf);

  const counterparts = new Set<string>();
  if (!senderIsSelf && sender.identifier) counterparts.add(sender.identifier);
  for (const recipient of [...to, ...cc])
    if (!recipient.isSelf && recipient.identifier) counterparts.add(recipient.identifier);

  return {
    unipileMessageId,
    providerMessageId: email.message_id?.trim() || null,
    unipileThreadId: email.thread_id?.trim() || unipileMessageId,
    provider: account.provider,
    direction: senderIsSelf ? MessagingMessageDirection.outbound : MessagingMessageDirection.inbound,
    origin: MessagingMessageOrigin.external,
    subject: email.subject ?? null,
    bodyHtml: email.body ?? null,
    bodyText: null,
    previewText: email.snippet ?? null,
    sender: { ...sender, isSelf: senderIsSelf },
    recipients: { to, cc, bcc },
    threadType: counterparts.size > 1 ? "group" : undefined,
    attachmentsMeta: toAttachmentsMeta(email.attachments),
    folderIds: email.folders ?? [],
    reactions: [],
    isEvent: false,
    isDeleted: false,
    isHidden: false,
    sentAt,
  };
}
