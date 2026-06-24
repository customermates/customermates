import type { IngestMessage, MessageReactionEntry, MessagingAttendee } from "./messaging.schema";
import type { UnipileChatAttendee, UnipileWebhookAttendee } from "./unipile.schema";

import type { z } from "zod";

import { MessagingMessageDirection, MessagingMessageOrigin, type MessagingProvider } from "@/generated/prisma";

import type { UnipileChatMessageSchema } from "./unipile.schema";
import { attendeePhone, buildChatAttendee, EMPTY_ATTENDEE, isSelfSender, mapChatAttachments } from "./unipile.mappers";

type UnipileChatMessage = z.infer<typeof UnipileChatMessageSchema>;

export type ChatSenderLookup = {
  byKey: Map<string, UnipileChatAttendee>;
  selfAttendeeId: string | null;
  selfSender: MessagingAttendee | undefined;
};

export type ChatMessageParts = {
  unipileMessageId: string;
  unipileThreadId: string;
  provider: IngestMessage["provider"];
  isOutbound: boolean;
  bodyText: IngestMessage["bodyText"];
  sender: MessagingAttendee;
  recipients?: IngestMessage["recipients"];
  attachmentsMeta: IngestMessage["attachmentsMeta"];
  reactions: IngestMessage["reactions"];
  isEvent: IngestMessage["isEvent"];
  deletedAt: IngestMessage["deletedAt"];
  threadType?: IngestMessage["threadType"];
  sentAt: IngestMessage["sentAt"];
};

export function buildChatMessage(parts: ChatMessageParts): IngestMessage {
  return {
    unipileMessageId: parts.unipileMessageId,
    unipileThreadId: parts.unipileThreadId,
    provider: parts.provider,
    direction: parts.isOutbound ? MessagingMessageDirection.outbound : MessagingMessageDirection.inbound,
    origin: MessagingMessageOrigin.external,
    subject: null,
    bodyHtml: null,
    bodyText: parts.bodyText,
    sender: { ...parts.sender, isSelf: parts.isOutbound },
    recipients: parts.recipients ?? { to: [], cc: [], bcc: [] },
    attachmentsMeta: parts.attachmentsMeta,
    reactions: parts.reactions,
    isEvent: parts.isEvent,
    deletedAt: parts.deletedAt,
    threadType: parts.threadType,
    sentAt: parts.sentAt,
  };
}

export function isOutboundChat(args: {
  isSender: boolean | null | undefined;
  senderIsSelf: boolean | null | undefined;
  senderAttendeeId: string | null | undefined;
  selfAttendeeId: string | null | undefined;
}): boolean {
  return isSelfSender({
    explicitOutbound: args.isSender === true || args.senderIsSelf === true,
    senderKey: args.senderAttendeeId,
    selfKey: args.selfAttendeeId,
  });
}

export function mapWebhookAttendee(input: UnipileWebhookAttendee | null | undefined): MessagingAttendee {
  if (!input) return EMPTY_ATTENDEE;

  return buildChatAttendee({
    id: input.attendee_id,
    name: input.attendee_name,
    phone: attendeePhone(input.attendee_specifics),
    publicIdentifier: input.attendee_public_identifier,
    providerId: input.attendee_provider_id,
    pictureUrl: input.attendee_profile_picture_url,
    profileUrl: input.attendee_profile_url,
    headline: input.attendee_specifics?.headline,
    occupation: input.attendee_specifics?.occupation,
  });
}

export function mapUnipileChatAttendee(input: UnipileChatAttendee | null | undefined): MessagingAttendee {
  if (!input) return EMPTY_ATTENDEE;

  return buildChatAttendee({
    id: input.id,
    name: input.name,
    phone: attendeePhone(input.specifics),
    publicIdentifier: input.public_identifier,
    providerId: input.provider_id,
    pictureUrl: input.picture_url,
    profileUrl: input.profile_url,
    headline: input.specifics?.headline,
    occupation: input.specifics?.occupation,
  });
}

export function indexAttendee(lookup: ChatSenderLookup, attendee: UnipileChatAttendee): void {
  if (attendee.provider_id) lookup.byKey.set(attendee.provider_id, attendee);
  if (attendee.id) lookup.byKey.set(attendee.id, attendee);

  if (attendee.is_self === true) {
    lookup.selfAttendeeId ??= attendee.id ?? null;
    lookup.selfSender ??= mapUnipileChatAttendee(attendee);
  }
}

export function resolveChatSender(raw: UnipileChatMessage, lookup: ChatSenderLookup): UnipileChatAttendee | undefined {
  return (
    (raw.sender_attendee_id ? lookup.byKey.get(raw.sender_attendee_id) : undefined) ??
    (raw.sender_id ? lookup.byKey.get(raw.sender_id) : undefined)
  );
}

function mapChatReactions(
  reactions: UnipileChatMessage["reactions"],
  byKey: Map<string, UnipileChatAttendee>,
): MessageReactionEntry[] {
  return (reactions ?? []).flatMap((reaction) => {
    if (!reaction.value) return [];

    const attendee = reaction.sender_id ? byKey.get(reaction.sender_id) : undefined;

    return [
      {
        value: reaction.value,
        attendeeId: attendee?.id ?? reaction.sender_id ?? "",
        attendeeDisplayName: attendee?.name ?? null,
        isSelf: reaction.is_sender === true || attendee?.is_self === true,
      },
    ];
  });
}

export function normalizeChatMessage(
  raw: UnipileChatMessage,
  lookup: ChatSenderLookup,
  provider: MessagingProvider,
): IngestMessage | null {
  if (raw.hidden) return null;
  if (!raw.id || !raw.chat_id) return null;

  const senderAttendee = resolveChatSender(raw, lookup);
  const isOutbound = isOutboundChat({
    isSender: raw.is_sender,
    senderIsSelf: senderAttendee?.is_self,
    senderAttendeeId: raw.sender_attendee_id,
    selfAttendeeId: lookup.selfAttendeeId,
  });
  const sender = senderAttendee ? mapUnipileChatAttendee(senderAttendee) : isOutbound ? lookup.selfSender : undefined;

  return buildChatMessage({
    unipileMessageId: raw.id,
    unipileThreadId: raw.chat_id,
    provider,
    isOutbound,
    bodyText: raw.text ?? null,
    sender: sender ?? EMPTY_ATTENDEE,
    attachmentsMeta: mapChatAttachments(raw.attachments),
    reactions: mapChatReactions(raw.reactions, lookup.byKey),
    isEvent: raw.is_event ?? false,
    deletedAt: raw.deleted ? raw.timestamp : null,
    sentAt: raw.timestamp,
  });
}
