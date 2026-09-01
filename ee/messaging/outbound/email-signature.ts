import markdownit from "markdown-it";

import { isPlainTextEmailBody } from "../email-quote";

export const SIGNATURE_DELIMITER = "\n\n-- \n";
const HTML_SIGNATURE_DELIMITER = "<br><br>-- <br>";

const signatureMarkdown = markdownit({ html: false, linkify: true, breaks: true });

export function toEmailHtml(body: string): string {
  if (!isPlainTextEmailBody(body)) return body;

  return body.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").split("\n").join("<br>");
}

export function signatureToHtml(signature: string): string {
  return signatureMarkdown.render(signature).trim();
}

export function composeEmailBodies(
  body: string,
  signature: string | null | undefined,
): { plainText: string; html: string } {
  const trimmed = signature?.trim();
  const html = toEmailHtml(body);
  if (!trimmed || body.includes(SIGNATURE_DELIMITER)) return { plainText: body, html };

  return {
    plainText: `${body.trimEnd()}${SIGNATURE_DELIMITER}${trimmed}`,
    html: `${html}${HTML_SIGNATURE_DELIMITER}${signatureToHtml(trimmed)}`,
  };
}
