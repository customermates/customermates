import type { SignatureFields } from "../signature-fields";

import { htmlToPlainText } from "../email-body-text";
import { isPlainTextEmailBody, splitQuotedText } from "../email-quote";
import { renderSignatureFields, signatureToHtml } from "./render-signature";

export const SIGNATURE_DELIMITER = "\n\n-- \n";
const HTML_SIGNATURE_DELIMITER = "<br><br>-- <br>";
const HTML_SIGNATURE_ATTRIBUTE = 'data-customermates-signature="true"';

export type EmailBodyFormat = "auto" | "plain_text" | "html";

export { signatureToHtml };

export function toEmailHtml(body: string, format: EmailBodyFormat = "auto"): string {
  if (format === "html" || (format === "auto" && !isPlainTextEmailBody(body))) return body;

  return body.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").split("\n").join("<br>");
}

function plainBodyAlreadyHasSignature(body: string): boolean {
  const visible = splitQuotedText(body).visible.trimEnd();

  return /(?:^|\n)-- \n[\s\S]*\S$/.test(visible);
}

function htmlBodyAlreadyHasSignature(body: string): boolean {
  return body.includes(HTML_SIGNATURE_ATTRIBUTE);
}

function appendHtmlSignature(body: string, signatureHtml: string): string {
  const block = `<div ${HTML_SIGNATURE_ATTRIBUTE}>${HTML_SIGNATURE_DELIMITER}${signatureHtml}</div>`;
  const closingBody = /<\/body\s*>/i;

  return closingBody.test(body) ? body.replace(closingBody, `${block}$&`) : `${body}${block}`;
}

export function renderSignature(
  signature: string | null | undefined,
  fields: SignatureFields | null,
): { html: string; text: string } | null {
  const markdown = signature?.trim() ?? "";
  if (!fields) return markdown ? { html: signatureToHtml(markdown), text: markdown } : null;

  return renderSignatureFields(fields, markdown);
}

export function composeEmailBodies(
  body: string,
  signature: string | null | undefined,
  fields?: SignatureFields | null,
  format: EmailBodyFormat = "auto",
): { plainText: string; html: string } {
  const rendered = renderSignature(signature, fields ?? null);
  const isHtml = format === "html" || (format === "auto" && !isPlainTextEmailBody(body));
  const plainText = isHtml ? (htmlToPlainText(body) ?? "[HTML content]") : body;
  const html = toEmailHtml(body, format);
  const alreadySigned = isHtml ? htmlBodyAlreadyHasSignature(html) : plainBodyAlreadyHasSignature(plainText);
  if (!rendered || alreadySigned) return { plainText, html };

  return {
    plainText: `${plainText.trimEnd()}${SIGNATURE_DELIMITER}${rendered.text}`,
    html: appendHtmlSignature(html, rendered.html),
  };
}
