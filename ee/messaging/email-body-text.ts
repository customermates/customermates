const REMOVED_BLOCK_TAGS = ["script", "style", "head", "noscript", "template"] as const;
const MAX_HTML_LENGTH = 1_000_000;
const MAX_TAG_LENGTH = 2048;
const MAX_HREF_LENGTH = 4096;
const MAX_ANCHOR_LABEL = 8192;
const BLOCK_BOUNDARY =
  /<\/?(?:p|div|br|hr|tr|table|thead|tbody|li|ul|ol|h[1-6]|blockquote|pre|section|article|header|footer|address)\b[^>]*>/gi;
const ANCHOR = new RegExp(
  `<a\\b[^>]{0,${MAX_TAG_LENGTH}}?href\\s*=\\s*(["'])([^"']{0,${MAX_HREF_LENGTH}})\\1[^>]{0,${MAX_TAG_LENGTH}}>` +
    `((?:[^<]|<(?!\\/a\\s*>)){0,${MAX_ANCHOR_LABEL}})<\\/a\\s*>`,
  "gi",
);
const REMAINING_TAGS = /<[^>]*>/g;
const URL_SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const URL_CONTROL_CHARS = /[\u0000-\u0020]/g;
const SAFE_URL_SCHEMES = new Set(["http:", "https:", "mailto:", "tel:"]);
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "-",
  mdash: "-",
  hellip: "...",
  laquo: '"',
  raquo: '"',
  ldquo: '"',
  rdquo: '"',
  lsquo: "'",
  rsquo: "'",
  euro: "EUR",
  pound: "GBP",
  copy: "(c)",
  reg: "(R)",
  trade: "(TM)",
  middot: "-",
  bull: "-",
};

function decodeEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => safeCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => safeCodePoint(Number(dec)))
    .replace(/&([a-z][a-z0-9]*);/gi, (match, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? match);
}

function safeCodePoint(code: number): string {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return "";
  if (code >= 0xd800 && code <= 0xdfff) return "";

  return String.fromCodePoint(code);
}

function collapse(value: string): string {
  return value
    .split("\n")
    .map((line) => line.replace(/[^\S\n]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripRemovedBlocks(html: string): string {
  const lower = html.toLowerCase();
  let out = "";
  let cursor = 0;

  while (cursor < html.length) {
    const open = lower.indexOf("<", cursor);
    if (open === -1) return out + html.slice(cursor);

    const tag = REMOVED_BLOCK_TAGS.find((candidate) => {
      if (!lower.startsWith(`<${candidate}`, open)) return false;
      const next = lower[open + 1 + candidate.length];
      return next === undefined || next === ">" || next === "/" || /\s/.test(next);
    });

    if (!tag) {
      out += html.slice(cursor, open + 1);
      cursor = open + 1;
      continue;
    }

    out += `${html.slice(cursor, open)} `;

    const openEnd = lower.indexOf(">", open);
    if (openEnd === -1) return out;

    const close = lower.indexOf(`</${tag}`, openEnd);
    if (close === -1) return out;

    const closeEnd = lower.indexOf(">", close);
    cursor = closeEnd === -1 ? html.length : closeEnd + 1;
  }

  return out;
}

function safeUrl(href: string): string | null {
  const url = href.replace(URL_CONTROL_CHARS, "");
  if (url === "") return null;

  const scheme = URL_SCHEME.exec(url)?.[0];
  if (!scheme) return url;

  return SAFE_URL_SCHEMES.has(scheme.toLowerCase()) ? url : null;
}

export function htmlToPlainText(html: string | null | undefined): string | null {
  if (typeof html !== "string" || html.trim() === "") return null;

  const bounded = html.length > MAX_HTML_LENGTH ? html.slice(0, MAX_HTML_LENGTH) : html;

  const withLinks = stripRemovedBlocks(bounded)
    .replace(ANCHOR, (_, __, href: string, label: string) => {
      const text = collapse(decodeEntities(label.replace(REMAINING_TAGS, " ")));
      const url = safeUrl(decodeEntities(href));
      if (!url) return text;
      if (!text || text === url) return url;

      return `${text} (${url})`;
    })
    .replace(BLOCK_BOUNDARY, "\n")
    .replace(REMAINING_TAGS, " ");

  const text = collapse(decodeEntities(withLinks));

  return text === "" ? null : text;
}
