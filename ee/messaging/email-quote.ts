const QUOTE_ATTRIBUTION_RE = /^(On .+ wrote:|Am .+ schrieb .+:)$/;

export function splitQuotedText(text: string): { visible: string; quoted: string | null } {
  const lines = text.split("\n");

  let start = lines.length;
  while (start > 0) {
    const line = lines[start - 1].trim();
    if (line === "" || line.startsWith(">")) {
      start -= 1;
      continue;
    }
    break;
  }

  if (start === lines.length) return { visible: text, quoted: null };
  if (!lines.slice(start).some((line) => line.trim().startsWith(">"))) return { visible: text, quoted: null };

  let cut = start;
  let probe = start;
  while (probe > 0 && lines[probe - 1].trim() === "") probe -= 1;
  if (probe > 0 && QUOTE_ATTRIBUTION_RE.test(lines[probe - 1].trim())) cut = probe - 1;

  const visible = lines.slice(0, cut).join("\n").trimEnd();
  if (!visible.trim()) return { visible: text, quoted: null };

  const quoted = lines.slice(cut).join("\n").trim();
  return { visible, quoted: quoted || null };
}

const HTML_DOCUMENT_RE = /<!doctype\s+html\b/i;
const HTML_PAIRED_TAG_RE = /<([a-z][a-z0-9-]*)\b[^>]*>[\s\S]*<\/\1\s*>/i;
const HTML_VOID_TAG_RE = /<(?:area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)\b[^>]*\/?\s*>/i;

export function isPlainTextEmailBody(html: string): boolean {
  return !HTML_DOCUMENT_RE.test(html) && !HTML_PAIRED_TAG_RE.test(html) && !HTML_VOID_TAG_RE.test(html);
}

export const HTML_QUOTE_SELECTORS =
  'div.gmail_quote, blockquote[type="cite"], #divRplyFwdMsg, div.yahoo_quoted, div.moz-cite-prefix';

export const HTML_QUOTE_HIDE_CSS = `${HTML_QUOTE_SELECTORS}, #divRplyFwdMsg ~ *, div.moz-cite-prefix ~ * { display: none; }`;

export function htmlContainsQuote(html: string): boolean {
  if (typeof window === "undefined" || !html) return false;
  const doc = new DOMParser().parseFromString(html, "text/html");
  return doc.querySelector(HTML_QUOTE_SELECTORS) !== null;
}
