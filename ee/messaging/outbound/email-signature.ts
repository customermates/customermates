import type { SignatureFields } from "../signature-fields";

import { isPlainTextEmailBody } from "../email-quote";
import { renderSignatureFields, signatureToHtml } from "./render-signature";

export const SIGNATURE_DELIMITER = "\n\n-- \n";
const HTML_SIGNATURE_DELIMITER = "<br><br>-- <br>";

export { signatureToHtml };

export function toEmailHtml(body: string): string {
  if (!isPlainTextEmailBody(body)) return body;

  return body.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").split("\n").join("<br>");
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
): { plainText: string; html: string } {
  const rendered = renderSignature(signature, fields ?? null);
  const html = toEmailHtml(body);
  if (!rendered || body.includes(SIGNATURE_DELIMITER)) return { plainText: body, html };

  return {
    plainText: `${body.trimEnd()}${SIGNATURE_DELIMITER}${rendered.text}`,
    html: `${html}${HTML_SIGNATURE_DELIMITER}${rendered.html}`,
  };
}
