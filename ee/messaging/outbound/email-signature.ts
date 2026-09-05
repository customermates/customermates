import type { EmailSettings } from "../email-settings";

import { defaultEmailSettings } from "../email-settings";
import { htmlToPlainText } from "../email-body-text";
import { isPlainTextEmailBody, splitQuotedText } from "../email-quote";
import { EMAIL_STYLES } from "../email-styles";
import { emailTextStyle, escapeHtml, renderEmailMarkdown, renderSignatureFields } from "./render-signature";

export const SIGNATURE_DELIMITER = "\n\n-- \n";
const HTML_SIGNATURE_ATTRIBUTE = 'data-customermates-signature="true"';
const HTML_BODY_ATTRIBUTE = 'data-customermates-email-body="true"';

export type EmailBodyFormat = "auto" | "plain_text" | "markdown" | "html";

function plainTextToHtml(body: string, settings: EmailSettings): string {
  const escaped = escapeHtml(body).split("\n").join("<br>");
  return `<div ${HTML_BODY_ATTRIBUTE} style="${emailTextStyle(settings.appearance)}">${escaped}</div>`;
}

export function toEmailHtml(
  body: string,
  format: EmailBodyFormat = "auto",
  settings: EmailSettings = defaultEmailSettings(),
): string {
  if (format === "html" || (format === "auto" && !isPlainTextEmailBody(body))) return body;
  if (format === "markdown") return renderEmailMarkdown(body, settings.appearance).html;
  return plainTextToHtml(body, settings);
}

function plainBodyAlreadyHasSignature(body: string): boolean {
  const visible = splitQuotedText(body).visible.trimEnd();
  return /(?:^|\n)-- \n[\s\S]*\S$/.test(visible);
}

function signatureBlock(signatureHtml: string, settings: EmailSettings): string {
  return `<div ${HTML_SIGNATURE_ATTRIBUTE} style="${emailTextStyle(settings.appearance)}padding-top:${EMAIL_STYLES.signatureGap}px;">${signatureHtml}</div>`;
}

function htmlBodyAlreadyHasSignature(body: string, block: string): boolean {
  const closingBodyIndex = body.search(/<\/body\s*>/i);
  return (closingBodyIndex < 0 ? body : body.slice(0, closingBodyIndex)).trimEnd().endsWith(block);
}

function appendHtmlSignature(body: string, block: string): string {
  const closingBody = /<\/body\s*>/i;
  return closingBody.test(body) ? body.replace(closingBody, (match) => block + match) : `${body}${block}`;
}

export function renderSignature(
  signature: string | null | undefined,
  settings: EmailSettings,
): { html: string; text: string } | null {
  const markdown = signature?.trim() ?? "";
  return renderSignatureFields(settings, markdown);
}

export function composeEmailBodies(
  body: string,
  signature: string | null | undefined,
  settings: EmailSettings,
  format: EmailBodyFormat = "auto",
): { plainText: string; html: string } {
  const resolvedSettings = settings;
  const isHtml = format === "html" || (format === "auto" && !isPlainTextEmailBody(body));
  const bodyParts =
    format === "markdown"
      ? renderEmailMarkdown(body, resolvedSettings.appearance)
      : {
          text: isHtml ? (htmlToPlainText(body) ?? "[HTML content]") : body,
          html: toEmailHtml(body, format, resolvedSettings),
        };
  const rendered = renderSignature(signature, resolvedSettings);
  const block = rendered?.html ? signatureBlock(rendered.html, resolvedSettings) : "";
  const alreadySigned = isHtml
    ? Boolean(block) && htmlBodyAlreadyHasSignature(bodyParts.html, block)
    : plainBodyAlreadyHasSignature(bodyParts.text);
  if (!rendered || alreadySigned) return { plainText: bodyParts.text, html: bodyParts.html };

  return {
    plainText: rendered.text ? `${bodyParts.text.trimEnd()}${SIGNATURE_DELIMITER}${rendered.text}` : bodyParts.text,
    html: block ? appendHtmlSignature(bodyParts.html, block) : bodyParts.html,
  };
}
