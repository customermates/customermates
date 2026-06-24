import type { IngestMessage, MessagingAttendee } from "./messaging.schema";
import type { UnipileChatAttendee, UnipileWebhookAttendee } from "./unipile.schema";

import { MessagingMessageDirection, MessagingMessageOrigin } from "@/generated/prisma";

import { attendeePhone, buildChatAttendee, EMPTY_ATTENDEE } from "./unipile.mappers";

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
  return (
    args.isSender === true ||
    args.senderIsSelf === true ||
    (Boolean(args.selfAttendeeId) && args.senderAttendeeId === args.selfAttendeeId)
  );
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
