import type { MessagingProvider, MessagingThreadType } from "@/generated/prisma";
import type { MessagingAttendee } from "./messaging.schema";

import { getProviderProfileUrl, isEmailProvider, isPhoneProvider } from "./provider";

export function contactFullName(contact: { firstName: string; lastName: string } | null | undefined): string {
  return contact ? `${contact.firstName} ${contact.lastName}`.trim() : "";
}

export function isGroupThread(thread: { type: MessagingThreadType }): boolean {
  return thread.type !== "single";
}

export function groupThreadName(
  thread: { name: string | null; subject: string | null; participants: { length: number } },
  t: (key: string, values?: Record<string, string | number>) => string,
): string {
  return thread.name?.trim() || thread.subject?.trim() || t("Inbox.groupThread", { count: thread.participants.length });
}

type LinkableAttendee = { isSelf?: boolean; identifier?: string | null; contact?: { id: string } | null };

export function isAttendeeUnlinked(attendee: LinkableAttendee): boolean {
  return !attendee.isSelf && Boolean(attendee.identifier?.trim()) && !attendee.contact;
}

export function threadHasUnlinkedAttendee(attendees: LinkableAttendee[]): boolean {
  return attendees.some(isAttendeeUnlinked);
}

const UNIPILE_UNSUPPORTED_REGEX = /Unipile cannot display this type of message/i;

export function isUnipileUnsupportedBody(text: string | null | undefined): boolean {
  return Boolean(text && UNIPILE_UNSUPPORTED_REGEX.test(text));
}

const PHONE_JID_REGEX = /^(\d{6,15})@(?:s\.whatsapp\.net|c\.us)$/i;
const PHONE_REGEX = /^\+?\d[\d\s\-()]*$/;

export function formatChannelIdentifier(provider: MessagingProvider, identifier: string | null | undefined): string {
  const id = identifier?.trim() ?? "";

  if (!id) return "";

  const phoneJid = PHONE_JID_REGEX.exec(id);
  if (phoneJid) return `+${phoneJid[1]}`;

  if (isPhoneProvider(provider) && PHONE_REGEX.test(id)) return id.startsWith("+") ? id : `+${id.replace(/\D/g, "")}`;

  if (isPhoneProvider(provider) && id.includes("@")) return "";

  return id;
}

export function channelUrl(provider: MessagingProvider, value: string, profileUrl?: string | null): string | null {
  return profileUrl ?? getProviderProfileUrl(provider, value);
}

export function channelDisplayLabel(provider: MessagingProvider, value: string, profileUrl?: string | null): string {
  const url = channelUrl(provider, value, profileUrl);
  if (!url) return formatChannelIdentifier(provider, value);

  try {
    const parsed = new URL(url);
    return `${parsed.hostname.replace(/^www\./, "")}${parsed.pathname.replace(/\/$/, "")}`;
  } catch {
    return url;
  }
}

export function messageSenderName(message: {
  provider: MessagingProvider;
  sender: {
    displayName?: string | null;
    identifier: string | null | undefined;
    contact?: { firstName: string; lastName: string } | null;
  };
}): string | null {
  return (
    contactFullName(message.sender.contact) ||
    message.sender.displayName?.trim() ||
    displayableIdentifier(message.provider, message.sender.identifier) ||
    null
  );
}

export function displayableIdentifier(
  provider: MessagingProvider,
  identifier: string | null | undefined,
): string | null {
  const id = identifier?.trim();

  if (!id) return null;

  const profileUrl = getProviderProfileUrl(provider, id);

  if (profileUrl) return profileUrl;
  if (isEmailProvider(provider)) return id;

  if (isPhoneProvider(provider)) {
    const formatted = formatChannelIdentifier(provider, id);

    return formatted.startsWith("+") ? formatted : null;
  }

  return null;
}

export function participantLabel(
  participant: MessagingAttendee,
  provider: MessagingProvider,
  fallback: string,
): string {
  return (
    contactFullName(participant.contact) ||
    participant.displayName?.trim() ||
    displayableIdentifier(provider, participant.identifier) ||
    fallback
  );
}

export function threadCounterpart<T extends { isSelf?: boolean | null }>(participants: T[]): T | null {
  return participants.find((p) => !p.isSelf) ?? participants[0] ?? null;
}

export function deriveThreadDisplay(
  thread: {
    type: MessagingThreadType;
    name: string | null;
    subject: string | null;
    provider: MessagingProvider;
    participants: MessagingAttendee[];
  },
  t: (key: string, values?: Record<string, string | number>) => string,
): {
  isGroup: boolean;
  isSelfChat: boolean;
  counterpart: MessagingAttendee | null;
  displayName: string;
  displayNameSecondary: string | null;
  avatarUrl: string | undefined;
  isUnlinked: boolean;
} {
  const isGroup = isGroupThread(thread);
  const counterpart = threadCounterpart(thread.participants);
  const isSelfChat = !isGroup && thread.participants.length > 0 && thread.participants.every((p) => p.isSelf);
  const fallback = isSelfChat
    ? t("Inbox.senderYou")
    : thread.provider === "linkedin"
      ? t("Inbox.linkedinContact")
      : t("Inbox.senderUnknown");
  const counterpartLabel = counterpart ? participantLabel(counterpart, thread.provider, fallback) : fallback;
  const emailSubject = !isGroup && isEmailProvider(thread.provider) ? thread.subject?.trim() || null : null;
  const displayName = isGroup ? groupThreadName(thread, t) : (emailSubject ?? counterpartLabel);
  const hasName = Boolean(contactFullName(counterpart?.contact) || counterpart?.displayName?.trim());
  const displayNameSecondary = emailSubject
    ? counterpart
      ? counterpartLabel
      : null
    : isGroup || !counterpart
      ? null
      : hasName
        ? displayableIdentifier(thread.provider, counterpart.identifier)
        : counterpart.occupation?.trim() || counterpart.headline?.trim() || null;
  const avatarUrl = isGroup ? undefined : (counterpart?.contact?.avatarUrl ?? counterpart?.pictureUrl ?? undefined);
  const isUnlinked = !isSelfChat && threadHasUnlinkedAttendee(thread.participants);

  return { isGroup, isSelfChat, counterpart, displayName, displayNameSecondary, avatarUrl, isUnlinked };
}

export function deriveMessageSender(
  message: { sender: MessagingAttendee; provider: MessagingProvider; direction: string },
  accountOwner: { displayName: string; avatarUrl: string | null } | null,
  senderAvatarUrl: string | null | undefined,
  t: (key: string, values?: Record<string, string | number>) => string,
): {
  resolvedName: string;
  avatarUrl: string | undefined;
  isUnlinked: boolean;
  isOutbound: boolean;
} {
  const isOutbound = message.direction === "outbound";
  const resolvedName =
    messageSenderName(message) ||
    (isOutbound ? accountOwner?.displayName : null) ||
    (isOutbound ? t("Inbox.senderYou") : t("Inbox.senderUnknown"));
  const avatarUrl =
    message.sender.contact?.avatarUrl ??
    senderAvatarUrl ??
    message.sender.pictureUrl ??
    (isOutbound ? (accountOwner?.avatarUrl ?? undefined) : undefined);
  const isUnlinked = !isOutbound && isAttendeeUnlinked(message.sender);

  return { resolvedName, avatarUrl: avatarUrl ?? undefined, isUnlinked, isOutbound };
}
