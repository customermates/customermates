import type { DomNode, FormatCallback } from "html-to-text";

import { convert } from "html-to-text";

const MAX_HTML_LENGTH = 1_000_000;
const MAX_DEPTH = 64;
const MAX_CHILD_NODES = 5_000;

const URL_SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const URL_CONTROL_CHARS = /[\u0000-\u0020]/g;
const STRIPPED_CONTROLS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const SAFE_URL_SCHEMES = new Set(["http:", "https:", "mailto:", "tel:"]);
const SKIPPED = ["script", "style", "head", "title", "noscript", "template", "img"];

function safeUrl(href: string): string | null {
  const url = href.replace(URL_CONTROL_CHARS, "");
  if (url === "") return null;

  const scheme = URL_SCHEME.exec(url)?.[0];
  if (!scheme) return url;

  return SAFE_URL_SCHEMES.has(scheme.toLowerCase()) ? url : null;
}

const formatSafeAnchor: FormatCallback = (elem, walk, builder) => {
  const node = elem as DomNode & { attribs?: Record<string, string>; children?: DomNode[] };
  const href = node.attribs?.href ? safeUrl(node.attribs.href) : null;

  let text = "";
  builder.pushWordTransform((word: string) => {
    if (word) text += word;

    return word;
  });
  walk(node.children ?? [], builder);
  builder.popWordTransform();

  if (!href || href === text) return;

  builder.addInline(text ? ` (${href})` : href, { noWordTransform: true });
};

const CONVERT_OPTIONS = {
  wordwrap: false as const,
  preserveNewlines: true,
  limits: {
    maxInputLength: MAX_HTML_LENGTH,
    maxDepth: MAX_DEPTH,
    maxChildNodes: MAX_CHILD_NODES,
    ellipsis: "",
  },
  formatters: { safeAnchor: formatSafeAnchor },
  selectors: [
    { selector: "a", format: "safeAnchor" },
    ...SKIPPED.map((selector) => ({ selector, format: "skip" })),
    { selector: "h1", options: { uppercase: false } },
    { selector: "h2", options: { uppercase: false } },
    { selector: "h3", options: { uppercase: false } },
    { selector: "h4", options: { uppercase: false } },
    { selector: "h5", options: { uppercase: false } },
    { selector: "h6", options: { uppercase: false } },
  ],
};

function collapse(value: string): string {
  return value
    .split("\n")
    .map((line) => line.replace(/[^\S\n]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function htmlToPlainText(html: string | null | undefined): string | null {
  if (typeof html !== "string" || html.trim() === "") return null;

  const text = collapse(convert(html, CONVERT_OPTIONS).replace(STRIPPED_CONTROLS, ""));

  return text === "" ? null : text;
}
