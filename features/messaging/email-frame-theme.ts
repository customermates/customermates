import { HTML_QUOTE_SELECTORS } from "@/ee/messaging/email-quote";

type EmailFrameTone = "own" | "adaptive" | "paper";

type EmailFrameScheme = "light" | "dark";

export type EmailFramePalette = {
  background: string;
  foreground: string;
  muted: string;
  link: string;
  border: string;
  fontFamily: string;
};

const OWN_EMAIL_SELECTOR =
  "[data-customermates-email-markdown], [data-customermates-signature], [data-customermates-email-body]";

const FALLBACK_PALETTE: EmailFramePalette = {
  background: "Canvas",
  foreground: "CanvasText",
  muted: "GrayText",
  link: "LinkText",
  border: "GrayText",
  fontFamily: "ui-sans-serif, system-ui, sans-serif",
};

const DARK_SCHEME_META = /\bdark\b/i;
const DARK_SCHEME_CSS = [
  /@media[^{]*prefers-color-scheme\s*:\s*dark/i,
  /color-scheme\s*:[^;}]*\bdark\b/i,
  /\[data-ogs[cb]\]/i,
];

function hasVisibleContent(element: Element): boolean {
  return Boolean(element.textContent?.trim()) || element.querySelector("img, svg, video, picture") !== null;
}

function isOwnEmail(body: HTMLElement): boolean {
  if ([...body.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim())) return false;
  const content = [...body.children].filter(
    (element) => !["STYLE", "META", "LINK", "BR"].includes(element.tagName) && hasVisibleContent(element),
  );
  if (!content.some((element) => element.matches(OWN_EMAIL_SELECTOR))) return false;

  return content.every((element) => element.matches(OWN_EMAIL_SELECTOR) || element.matches(HTML_QUOTE_SELECTORS));
}

export function supportsDarkMode(document: Document): boolean {
  const metas = document.querySelectorAll('meta[name="color-scheme" i], meta[name="supported-color-schemes" i]');
  if ([...metas].some((meta) => DARK_SCHEME_META.test(meta.getAttribute("content") ?? ""))) return true;
  const css = [
    ...[...document.querySelectorAll("style")].map((style) => style.textContent ?? ""),
    ...[...document.querySelectorAll("[style]")].map((element) => element.getAttribute("style") ?? ""),
  ].join("\n");

  return DARK_SCHEME_CSS.some((pattern) => pattern.test(css));
}

export function emailFrameTone(html: string): EmailFrameTone {
  const document = new DOMParser().parseFromString(html, "text/html");
  if (isOwnEmail(document.body)) return "own";

  return supportsDarkMode(document) ? "adaptive" : "paper";
}

export function readEmailFramePalette(): EmailFramePalette {
  const root = getComputedStyle(document.documentElement);
  const token = (name: string, fallback: string) => root.getPropertyValue(name).trim() || fallback;
  const fontFamily = document.body ? getComputedStyle(document.body).fontFamily : "";

  return {
    background: token("--card", FALLBACK_PALETTE.background),
    foreground: token("--card-foreground", FALLBACK_PALETTE.foreground),
    muted: token("--muted-foreground", FALLBACK_PALETTE.muted),
    link: token("--primary", FALLBACK_PALETTE.link),
    border: token("--border-strong", FALLBACK_PALETTE.border),
    fontFamily: fontFamily?.trim() || FALLBACK_PALETTE.fontFamily,
  };
}

export function emailFrameThemeCss(tone: EmailFrameTone, scheme: EmailFrameScheme, palette: EmailFramePalette): string {
  if (tone === "paper") return "";
  if (tone === "adaptive")
    return `html { color-scheme: light dark; background: transparent; color: CanvasText; } body { background: transparent; }`;

  const own = `:is(${OWN_EMAIL_SELECTOR})`;
  return [
    `html { color-scheme: ${scheme}; background: ${palette.background}; color: ${palette.foreground}; }`,
    `body { padding: 10px 14px 14px; background: ${palette.background}; color: ${palette.foreground}; font-family: ${palette.fontFamily}; font-size: 14px; line-height: 1.6; }`,
    `${own}, ${own} :is(div, p, span, td, th, li, ul, ol, strong, em, b, i, table) { color: inherit !important; font-family: inherit !important; line-height: inherit !important; }`,
    `${own} p { margin: 0 0 10px !important; }`,
    `${own} a { color: ${palette.link} !important; text-decoration-color: color-mix(in srgb, currentColor 40%, transparent) !important; text-underline-offset: 2px; }`,
    `${own} blockquote { color: ${palette.muted} !important; border-left-color: ${palette.border} !important; }`,
    `${own} :is(hr, td) { border-color: ${palette.border} !important; }`,
    `[data-customermates-signature] { color: ${palette.muted} !important; }`,
    `body > :last-child, ${own} > :last-child, ${own} p:last-child { margin-bottom: 0 !important; }`,
  ].join("\n");
}
