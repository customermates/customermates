import type { AttachmentMeta, MessagingAttendee } from "./messaging.schema";

import { recordRequestHash } from "@/features/records/record-request-hash";

import { htmlToPlainText } from "./email-body-text";
import { isPlainTextEmailBody } from "./email-quote";

const INVISIBLE = /[\s\u00ad\u200b-\u200d\u2060\ufeff]+/gu;

type SentAttachment = { filename: string; content_type: string; content: string };

type EmailCopy = {
  to: readonly (string | null | undefined)[];
  cc: readonly (string | null | undefined)[];
  subject: string | null;
  text: string | null;
  attachmentNames: readonly (string | null | undefined)[];
};

export type SyncedEmailCopy = {
  recipients: { to: Pick<MessagingAttendee, "identifier">[]; cc: Pick<MessagingAttendee, "identifier">[] };
  subject: string | null;
  bodyHtml: string | null;
  bodyText: string | null;
  attachmentsMeta: Pick<AttachmentMeta, "name" | "fileName">[];
};

function compact(value: string | null | undefined): string {
  return (value ?? "").normalize("NFC").replace(INVISIBLE, "");
}

function addressKeys(values: readonly (string | null | undefined)[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => (value ?? "").trim().toLowerCase()).filter(Boolean))].sort();
}

function attachmentDigests(attachments: readonly SentAttachment[] | undefined) {
  return (attachments ?? []).map((attachment) => [
    attachment.filename,
    attachment.content_type,
    recordRequestHash(attachment.content),
  ]);
}

function emailBodyText(body: string | null | undefined): string | null {
  if (!body?.trim()) return null;
  return isPlainTextEmailBody(body) ? body.trim() : htmlToPlainText(body);
}

function emailCopyKey(copy: EmailCopy): string {
  return recordRequestHash([
    "email-copy",
    addressKeys(copy.to),
    addressKeys(copy.cc),
    compact(copy.subject),
    compact(copy.text),
    copy.attachmentNames.map((name) => compact(name).toLowerCase()).sort(),
  ]);
}

export function emailSendContentHash(content: {
  to: readonly string[];
  cc?: readonly string[];
  bcc?: readonly string[];
  subject: string;
  body: string;
  attachments?: readonly SentAttachment[];
}): string {
  return recordRequestHash([
    "email",
    addressKeys(content.to),
    addressKeys(content.cc),
    addressKeys(content.bcc),
    content.subject,
    content.body,
    attachmentDigests(content.attachments),
  ]);
}

export function chatSendContentHash(content: { text: string; attachments?: readonly SentAttachment[] }): string {
  return recordRequestHash(["chat", content.text, attachmentDigests(content.attachments)]);
}

export function emailSendCopyHashes(send: {
  to: readonly string[];
  cc?: readonly string[];
  subject: string;
  html: string;
  plainText: string;
  attachments?: readonly { filename: string }[];
}): string[] {
  const copy = {
    to: send.to,
    cc: send.cc ?? [],
    subject: send.subject,
    attachmentNames: (send.attachments ?? []).map((attachment) => attachment.filename),
  };
  return [
    ...new Set([
      emailCopyKey({ ...copy, text: emailBodyText(send.html) }),
      emailCopyKey({ ...copy, text: send.plainText }),
    ]),
  ];
}

export function syncedEmailCopyHash(message: SyncedEmailCopy): string {
  return emailCopyKey({
    to: message.recipients.to.map((recipient) => recipient.identifier),
    cc: message.recipients.cc.map((recipient) => recipient.identifier),
    subject: message.subject,
    text: emailBodyText(message.bodyHtml) ?? message.bodyText,
    attachmentNames: message.attachmentsMeta.map((attachment) => attachment.fileName ?? attachment.name),
  });
}
