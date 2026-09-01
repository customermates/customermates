import { isPlainTextEmailBody } from "../email-quote";

export const SIGNATURE_DELIMITER = "\n\n-- \n";

export function applyEmailSignature(body: string, signature: string | null | undefined): string {
  const trimmed = signature?.trim();
  if (!trimmed) return body;
  if (body.includes(SIGNATURE_DELIMITER)) return body;

  return `${body.trimEnd()}${SIGNATURE_DELIMITER}${trimmed}`;
}

export function toEmailHtml(body: string): string {
  if (!isPlainTextEmailBody(body)) return body;

  return body.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").split("\n").join("<br>");
}
