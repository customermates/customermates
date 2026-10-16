import type { AttachmentMeta, MessagingAttendee } from "./messaging.schema";

import { createHash } from "node:crypto";

import { htmlToPlainText } from "./email-body-text";
import { isPlainTextEmailBody } from "./email-quote";

const INVISIBLE = /[\s\u00ad\u200b-\u200d\u2060\ufeff]+/gu;

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

function addressKeys(values: readonly (string | null | undefined)[]): string[] {
  return [...new Set(values.map((value) => (value ?? "").trim().toLowerCase()).filter(Boolean))].sort();
}

function emailBodyText(body: string | null | undefined): string | null {
  if (!body?.trim()) return null;
  return isPlainTextEmailBody(body) ? body.trim() : htmlToPlainText(body);
}

function emailCopyKey(copy: EmailCopy): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        "email-copy",
        addressKeys(copy.to),
        addressKeys(copy.cc),
        compact(copy.subject),
        compact(copy.text),
        copy.attachmentNames.map((name) => compact(name).toLowerCase()).sort(),
      ]),
    )
    .digest("hex");
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
