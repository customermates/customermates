import type { EmailSettings } from "../email-settings";

import { defaultEmailSettings, SignatureTemplate } from "../email-settings";
import { htmlToPlainText } from "../email-body-text";
import { isPlainTextEmailBody, splitQuotedText } from "../email-quote";
import { emailTextStyle, escapeHtml, renderEmailMarkdown, renderSignatureFields } from "./render-signature";

export const SIGNATURE_DELIMITER = "\n\n-- \n";
const HTML_SIGNATURE_DELIMITER = "<br><br>-- <br>";
const HTML_SIGNATURE_ATTRIBUTE = 'data-customermates-signature="true"';
const HTML_BODY_ATTRIBUTE = 'data-customermates-email-body="true"';

export type EmailBodyFormat = "auto" | "plain_text" | "markdown" | "html";

function settingsForLegacyMarkdown(signature: string | null | undefined): EmailSettings {
  const settings = defaultEmailSettings();
  settings.signature.enabled = Boolean(signature?.trim());
  settings.signature.template = SignatureTemplate.plain;
  settings.signature.logoUrl = "";
  return settings;
}

export function signatureToHtml(signature: string, settings = settingsForLegacyMarkdown(signature)): string {
  return renderEmailMarkdown(signature, settings.appearance).html;
}

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

function htmlBodyAlreadyHasSignature(body: string): boolean {
  return body.includes(HTML_SIGNATURE_ATTRIBUTE);
}

function appendHtmlSignature(body: string, signatureHtml: string, settings: EmailSettings): string {
  const block = `<div ${HTML_SIGNATURE_ATTRIBUTE} style="${emailTextStyle(settings.appearance)}">${HTML_SIGNATURE_DELIMITER}${signatureHtml}</div>`;
  const closingBody = /<\/body\s*>/i;
  return closingBody.test(body) ? body.replace(closingBody, `${block}$&`) : `${body}${block}`;
}

export function renderSignature(
  signature: string | null | undefined,
  settings: EmailSettings | null,
): { html: string; text: string } | null {
  const markdown = signature?.trim() ?? "";
  return renderSignatureFields(settings ?? settingsForLegacyMarkdown(markdown), markdown);
}

export function composeEmailBodies(
  body: string,
  signature: string | null | undefined,
  settings?: EmailSettings | null,
  format: EmailBodyFormat = "auto",
): { plainText: string; html: string } {
  const resolvedSettings = settings ?? settingsForLegacyMarkdown(signature);
  const isHtml = format === "html" || (format === "auto" && !isPlainTextEmailBody(body));
  const bodyParts =
    format === "markdown"
      ? renderEmailMarkdown(body, resolvedSettings.appearance)
      : {
          text: isHtml ? (htmlToPlainText(body) ?? "[HTML content]") : body,
          html: toEmailHtml(body, format, resolvedSettings),
        };
  const rendered = renderSignature(signature, resolvedSettings);
  const alreadySigned = isHtml
    ? htmlBodyAlreadyHasSignature(bodyParts.html)
    : plainBodyAlreadyHasSignature(bodyParts.text);
  if (!rendered || alreadySigned) return { plainText: bodyParts.text, html: bodyParts.html };

  return {
    plainText: rendered.text ? `${bodyParts.text.trimEnd()}${SIGNATURE_DELIMITER}${rendered.text}` : bodyParts.text,
    html: rendered.html ? appendHtmlSignature(bodyParts.html, rendered.html, resolvedSettings) : bodyParts.html,
  };
}
