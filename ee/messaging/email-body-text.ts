const REMOVED_BLOCKS = /<(script|style|head|noscript|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
const BLOCK_BOUNDARY =
  /<\/?(?:p|div|br|hr|tr|table|thead|tbody|li|ul|ol|h[1-6]|blockquote|pre|section|article|header|footer|address)\b[^>]*>/gi;
const ANCHOR = /<a\b[^>]*?href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a\s*>/gi;
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

function safeUrl(href: string): string | null {
  const url = href.replace(URL_CONTROL_CHARS, "");
  if (url === "") return null;

  const scheme = URL_SCHEME.exec(url)?.[0];
  if (!scheme) return url;

  return SAFE_URL_SCHEMES.has(scheme.toLowerCase()) ? url : null;
}

export function htmlToPlainText(html: string | null | undefined): string | null {
  if (typeof html !== "string" || html.trim() === "") return null;

  const withLinks = html
    .replace(REMOVED_BLOCKS, " ")
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
