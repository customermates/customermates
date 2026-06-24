import type { UnipileAccount, UnipileAccountStatus, UnipileChatAttachment, UnipileEmail } from "./unipile.schema";
import type { AttachmentMeta, IngestMessage, MessagingAttendee } from "./messaging.schema";

import {
  ConnectedAccountStatus,
  MessagingMessageDirection,
  MessagingMessageOrigin,
  MessagingProvider,
  MessagingThreadState,
} from "@/generated/prisma";

const ACCOUNT_TYPE_TO_PROVIDER: Record<string, MessagingProvider> = {
  GOOGLE_OAUTH: MessagingProvider.google,
  GOOGLE_CALENDAR: MessagingProvider.google,
  OUTLOOK: MessagingProvider.outlook,
  MAIL: MessagingProvider.mail,
  ICLOUD: MessagingProvider.mail,
  EXCHANGE: MessagingProvider.mail,
  WHATSAPP: MessagingProvider.whatsapp,
  LINKEDIN: MessagingProvider.linkedin,
  INSTAGRAM: MessagingProvider.instagram,
  TELEGRAM: MessagingProvider.telegram,
};

export function mapUnipileProvider(code: string | null | undefined): MessagingProvider {
  if (!code) return MessagingProvider.mail;
  return ACCOUNT_TYPE_TO_PROVIDER[code.toUpperCase()] ?? MessagingProvider.mail;
}

const UNIPILE_TO_DB_STATUS: Record<UnipileAccountStatus, ConnectedAccountStatus> = {
  OK: ConnectedAccountStatus.ok,
  CONNECTING: ConnectedAccountStatus.connecting,
  CREDENTIALS: ConnectedAccountStatus.credentials,
  PERMISSIONS: ConnectedAccountStatus.permissions,
  ERROR: ConnectedAccountStatus.error,
  STOPPED: ConnectedAccountStatus.stopped,
  DELETED: ConnectedAccountStatus.deleted,
  CREATION_SUCCESS: ConnectedAccountStatus.ok,
  CREATION_FAIL: ConnectedAccountStatus.error,
  RECONNECTED: ConnectedAccountStatus.ok,
  SYNC_SUCCESS: ConnectedAccountStatus.ok,
};

export function mapUnipileStatus(code: string | undefined): ConnectedAccountStatus {
  if (!code) return ConnectedAccountStatus.connecting;

  const normalized = code.toUpperCase() as UnipileAccountStatus;

  return UNIPILE_TO_DB_STATUS[normalized] ?? ConnectedAccountStatus.error;
}

export function deriveAccountFeatures(snapshot: UnipileAccount): { hasMessaging: boolean; hasCalendar: boolean } {
  const sourceIds = (snapshot.sources ?? []).map((s) => s.id?.toUpperCase() ?? "");

  return {
    hasMessaging: sourceIds.length === 0 || sourceIds.some((id) => id.endsWith("_MAILS") || id.endsWith("_MESSAGING")),
    hasCalendar: sourceIds.some((id) => id.endsWith("_CALENDAR")),
  };
}

export function deriveAccountIdentity(
  snapshot: UnipileAccount,
  isEmail: boolean,
): { displayName: string | null; emailAddress: string | null } {
  const mail = snapshot.connection_params?.mail;

  return {
    displayName: snapshot.name ?? null,
    emailAddress: isEmail ? (mail?.imap_user ?? mail?.username ?? snapshot.name ?? null) : null,
  };
}

const ROLE_TO_THREAD_STATE: Record<string, MessagingThreadState> = {
  archive: MessagingThreadState.closed,
  trash: MessagingThreadState.closed,
  spam: MessagingThreadState.spam,
  inbox: MessagingThreadState.open,
};

function threadStateFromFolders(folders: string[] | null | undefined): MessagingThreadState | undefined {
  for (const raw of folders ?? []) {
    const folder = raw.toUpperCase();
    if (folder.includes("SPAM") || folder.includes("JUNK")) return MessagingThreadState.spam;
    if (folder.includes("TRASH") || folder.includes("DELETED") || folder.includes("BIN"))
      return MessagingThreadState.closed;
    if (folder.includes("ARCHIVE") || folder.includes("ALLMAIL") || folder.includes("ALL MAIL"))
      return MessagingThreadState.closed;
    if (folder.includes("INBOX")) return MessagingThreadState.open;
  }

  return undefined;
}

export function emailMoveToThreadState(args: {
  role?: string | null;
  folders?: string[] | null;
}): MessagingThreadState | undefined {
  const role = args.role?.trim().toLowerCase();

  return (role ? ROLE_TO_THREAD_STATE[role] : undefined) ?? threadStateFromFolders(args.folders);
}

export const EMPTY_ATTENDEE: MessagingAttendee = {
  attendeeId: "",
  displayName: null,
  identifier: "",
  pictureUrl: null,
  profileUrl: null,
  headline: null,
  occupation: null,
};

function mailAttendee(input: NonNullable<UnipileEmail["from_attendee"]> | null | undefined): MessagingAttendee {
  const identifier = (input?.identifier ?? "").trim().toLowerCase();

  return input
    ? {
        ...EMPTY_ATTENDEE,
        attendeeId: identifier,
        displayName: input.display_name ?? null,
        identifier,
        pictureUrl: input.profile_picture ?? null,
      }
    : EMPTY_ATTENDEE;
}

function mailRecipients(list: UnipileEmail["to_attendees"]): MessagingAttendee[] {
  return (list ?? []).map(mailAttendee).filter((a) => a.identifier);
}

export function isSelfSender(args: {
  explicitOutbound?: boolean | null;
  senderKey?: string | null;
  selfKey?: string | null;
}): boolean {
  return args.explicitOutbound === true || (Boolean(args.selfKey) && args.senderKey === args.selfKey);
}

export function buildEmailMessage(
  fields: UnipileEmail,
  isOutbound: boolean,
  selfEmail?: string | null,
): IngestMessage | null {
  const unipileMessageId = fields.email_id ?? fields.id;
  if (!unipileMessageId) return null;

  const self = selfEmail?.trim().toLowerCase() || null;
  const sender = mailAttendee(fields.from_attendee);
  const senderIsSelf = isSelfSender({ explicitOutbound: isOutbound, senderKey: sender.identifier, selfKey: self });
  const markSelf = (attendee: MessagingAttendee): MessagingAttendee =>
    self !== null && attendee.identifier === self ? { ...attendee, isSelf: true } : attendee;
  const to = mailRecipients(fields.to_attendees).map(markSelf);
  const cc = mailRecipients(fields.cc_attendees).map(markSelf);
  const bcc = mailRecipients(fields.bcc_attendees).map(markSelf);

  const counterparts = new Set<string>();
  if (!senderIsSelf && sender.identifier) counterparts.add(sender.identifier);
  for (const recipient of [...to, ...cc])
    if (!recipient.isSelf && recipient.identifier) counterparts.add(recipient.identifier);

  return {
    unipileMessageId,
    unipileThreadId: fields.thread_id?.trim() || unipileMessageId,
    provider: mapUnipileProvider(fields.type),
    direction: senderIsSelf ? MessagingMessageDirection.outbound : MessagingMessageDirection.inbound,
    origin: fields.origin === "unipile" ? MessagingMessageOrigin.unipile : MessagingMessageOrigin.external,
    subject: fields.subject ?? null,
    bodyHtml: fields.body ?? null,
    bodyText: fields.body_plain ?? null,
    sender: { ...sender, isSelf: senderIsSelf },
    recipients: { to, cc, bcc },
    threadType: counterparts.size > 1 ? "group" : undefined,
    attachmentsMeta: (fields.attachments ?? []).flatMap((a) =>
      a.id && a.name
        ? [
            {
              id: a.id,
              name: a.name,
              fileName: a.name,
              size: a.size ?? null,
              mime: a.mime ?? null,
            },
          ]
        : [],
    ),
    reactions: [],
    isEvent: false,
    deletedAt: null,
    sentAt: fields.date,
  };
}

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
  if (phoneDigits) return phoneDigits;

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

export function mapChatAttachments(list: UnipileChatAttachment[] | null | undefined): AttachmentMeta[] {
  return (list ?? []).flatMap((a) => {
    const id = a.id ?? a.attachment_id;
    if (!id) return [];

    return [
      {
        id,
        name: a.file_name ?? null,
        fileName: a.file_name ?? null,
        type: a.type ?? a.attachment_type ?? null,
        mime: a.mimetype ?? null,
        url: a.url ?? a.attachment_url ?? null,
        size: a.file_size ?? a.attachment_size ?? null,
        sticker: a.sticker ?? null,
        voiceNote: a.voice_note ?? null,
        gif: a.gif ?? null,
        durationSeconds: typeof a.duration === "number" ? a.duration : null,
        unavailable: a.unavailable ?? null,
      },
    ];
  });
}
