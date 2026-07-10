import type { AttachmentMeta, IngestMessage, MessagingAttendee } from "./messaging.schema";
import type { UnipileAttachment, UnipileMessage, UnipileUser } from "./unipile.schema";

import { MessagingMessageDirection, MessagingMessageOrigin, MessagingProvider } from "@/generated/prisma";

import { attendeePhone, buildChatAttendee, EMPTY_ATTENDEE } from "./unipile.mappers";
import { UnipileGroupParticipantSchema, UnipileUserSchema } from "./unipile.schema";

export function mapUnipileUser(user: UnipileUser | null | undefined, opts?: { isSelf?: boolean }): MessagingAttendee {
  if (!user) return EMPTY_ATTENDEE;

  const attendee = buildChatAttendee({
    id: user.id,
    name: user.display_name || `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim() || null,
    phone: attendeePhone(user.specifics),
    publicIdentifier: user.public_identifier,
    providerId: user.id,
    pictureUrl: user.public_picture_url,
    profileUrl: user.profile_url,
    headline: user.specifics?.headline,
    occupation: user.specifics?.occupation ?? user.specifics?.industry,
  });

  return opts?.isSelf ? { ...attendee, isSelf: true } : attendee;
}

export function mapParticipantRecord(raw: unknown): MessagingAttendee | null {
  const wrapped = UnipileGroupParticipantSchema.safeParse(raw);
  if (wrapped.success)
    return wrapped.data.is_self === true ? null : mapUnipileUser(wrapped.data.user, { isSelf: false });

  const parsed = UnipileUserSchema.safeParse(raw);
  return parsed.success ? mapUnipileUser(parsed.data) : null;
}

export function mapUnipileAttachments(list: UnipileAttachment[] | null | undefined): AttachmentMeta[] {
  return (list ?? []).flatMap((a) => {
    if (!a.id) return [];

    return [
      {
        id: a.id,
        name: a.filename ?? null,
        fileName: a.filename ?? null,
        type: a.type ?? null,
        mime: a.mimetype ?? null,
        url: a.url ?? null,
        size: a.file_size ?? null,
        sticker: a.sticker ?? null,
        voiceNote: a.voice_note ?? null,
        gif: a.gif ?? null,
        durationSeconds: typeof a.duration === "number" ? a.duration : null,
        unavailable: a.is_unavailable ?? null,
      },
    ];
  });
}

const WHATSAPP_GROUP_SUFFIX = "@g.us";

const EXCLUDED_CHAT_SUFFIXES = ["@newsletter", "@broadcast"];

export function isExcludedChatId(chatId: string | null | undefined): boolean {
  return chatId != null && EXCLUDED_CHAT_SUFFIXES.some((suffix) => chatId.endsWith(suffix));
}

function inferWhatsappGroupType(chatId: string, provider: MessagingProvider): IngestMessage["threadType"] {
  return provider === MessagingProvider.whatsapp && chatId.endsWith(WHATSAPP_GROUP_SUFFIX) ? "group" : undefined;
}

export function normalizeChatMessage(raw: UnipileMessage, provider: MessagingProvider): IngestMessage | null {
  if (!raw.id || !raw.chat_id) return null;
  if (isExcludedChatId(raw.chat_id)) return null;

  const sentAt = new Date(raw.timestamp);
  if (Number.isNaN(sentAt.getTime())) return null;

  const isOutbound = raw.is_sender === true;
  const sender = mapUnipileUser(raw.sender, { isSelf: isOutbound });
  const bodyText = raw.text ?? null;
  const attachmentsMeta = mapUnipileAttachments(raw.attachments);
  const isEvent = raw.is_event ?? false;
  const isDeleted = raw.is_deleted ?? false;
  const isContentless = !bodyText?.trim() && attachmentsMeta.length === 0 && !isEvent && !isDeleted;

  return {
    unipileMessageId: raw.id,
    unipileThreadId: raw.chat_id,
    provider,
    direction: isOutbound ? MessagingMessageDirection.outbound : MessagingMessageDirection.inbound,
    origin: MessagingMessageOrigin.external,
    subject: raw.specifics?.subject ?? null,
    bodyHtml: null,
    bodyText,
    sender: { ...sender, isSelf: isOutbound },
    recipients: { to: [], cc: [], bcc: [] },
    attachmentsMeta,
    reactions: [],
    isEvent,
    isDeleted,
    isHidden: (raw.is_hidden ?? false) || isContentless,
    threadType: inferWhatsappGroupType(raw.chat_id, provider),
    sentAt,
    editedAt: raw.is_edited === true ? sentAt : null,
  };
}
