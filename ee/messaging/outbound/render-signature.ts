import type { EmailSettings } from "../email-settings";

import markdownit from "markdown-it";

import { EmailLinkStyle, EMAIL_FONT_STACK, SignatureTemplate } from "../email-settings";
import { htmlToPlainText } from "../email-body-text";

type SignatureTemplateDefinition = {
  logoPosition: "none" | "above" | "beside";
  logoPx: number;
  maxWidthPx: number;
};

export const SIGNATURE_TEMPLATES: Record<SignatureTemplate, SignatureTemplateDefinition> = {
  [SignatureTemplate.plain]: {
    logoPosition: "none",
    logoPx: 0,
    maxWidthPx: 460,
  },
  [SignatureTemplate.stacked]: {
    logoPosition: "above",
    logoPx: 48,
    maxWidthPx: 460,
  },
  [SignatureTemplate.sideBySide]: {
    logoPosition: "beside",
    logoPx: 56,
    maxWidthPx: 520,
  },
};

const TEXT_COLOR = "#1a1a1a";
const DIVIDER_COLOR = "#8a8a8a";
const SAFE_LINK_PROTOCOL = /^(?:https?:|mailto:|tel:)/i;

type MarkdownEnv = { appearance?: EmailSettings["appearance"] };

export const emailMarkdown = markdownit({
  html: false,
  linkify: true,
  breaks: true,
});
emailMarkdown.validateLink = (url) => SAFE_LINK_PROTOCOL.test(url);

type RenderRule = NonNullable<typeof emailMarkdown.renderer.rules.link_open>;
const renderToken: RenderRule = (tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options);

const baseLinkOpen = emailMarkdown.renderer.rules.link_open ?? renderToken;
const baseParagraphOpen = emailMarkdown.renderer.rules.paragraph_open ?? renderToken;
const baseBulletListOpen = emailMarkdown.renderer.rules.bullet_list_open ?? renderToken;
const baseOrderedListOpen = emailMarkdown.renderer.rules.ordered_list_open ?? renderToken;
const baseBlockquoteOpen = emailMarkdown.renderer.rules.blockquote_open ?? renderToken;

emailMarkdown.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const href = token.attrGet("href");
  if (href && token.markup === "linkify" && href.startsWith("http://"))
    token.attrSet("href", `https://${href.slice("http://".length)}`);

  const appearance = (env as MarkdownEnv | undefined)?.appearance;
  if (appearance) {
    token.attrSet(
      "style",
      `color:${appearance.linkHex};text-decoration:${appearance.linkStyle === EmailLinkStyle.underlined ? "underline" : "none"};`,
    );
  }

  return baseLinkOpen(tokens, idx, options, env, self);
};

emailMarkdown.renderer.rules.paragraph_open = (tokens, idx, options, env, self) => {
  tokens[idx].attrSet("style", "margin:0 0 8px 0;padding:0;");
  return baseParagraphOpen(tokens, idx, options, env, self);
};

emailMarkdown.renderer.rules.bullet_list_open = (tokens, idx, options, env, self) => {
  tokens[idx].attrSet("style", "margin:0 0 8px 0;padding-left:20px;");
  return baseBulletListOpen(tokens, idx, options, env, self);
};

emailMarkdown.renderer.rules.ordered_list_open = (tokens, idx, options, env, self) => {
  tokens[idx].attrSet("style", "margin:0 0 8px 0;padding-left:20px;");
  return baseOrderedListOpen(tokens, idx, options, env, self);
};

emailMarkdown.renderer.rules.blockquote_open = (tokens, idx, options, env, self) => {
  tokens[idx].attrSet("style", `margin:0 0 8px 0;padding-left:12px;border-left:2px solid ${DIVIDER_COLOR};`);
  return baseBlockquoteOpen(tokens, idx, options, env, self);
};

emailMarkdown.renderer.rules.image = (tokens, idx) =>
  escapeHtml(tokens[idx].content || tokens[idx].attrGet("alt") || "");

emailMarkdown.disable(["code", "fence", "heading", "table"]);

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function emailTextStyle(appearance: EmailSettings["appearance"]): string {
  const fontSize = appearance.fontSize;
  return `font-family:${EMAIL_FONT_STACK[appearance.fontFamily]};font-size:${fontSize}px;line-height:${fontSize + 7}px;mso-line-height-rule:exactly;color:${TEXT_COLOR};`;
}

export function renderEmailMarkdown(
  markdown: string,
  appearance: EmailSettings["appearance"],
): { html: string; text: string } {
  const source = markdown.trim();
  if (!source) return { html: "", text: "" };

  const inner = emailMarkdown.render(source, { appearance }).trim();
  const html = `<div data-customermates-email-markdown="true" style="${emailTextStyle(appearance)}">${inner}</div>`;
  const plainTextHtml = inner.replace(/(<br\b[^>]*>)\r?\n/gi, "$1");
  return { html, text: htmlToPlainText(plainTextHtml) ?? "" };
}

function logoCell(settings: EmailSettings, definition: SignatureTemplateDefinition, extraStyle: string): string {
  const size = definition.logoPx;
  const cellStyle = `font-size:0;line-height:0;mso-line-height-rule:exactly;vertical-align:top;${extraStyle}`;
  const img = `<img src="${escapeHtml(settings.signature.logoUrl)}" width="${size}" height="${size}" alt="" border="0" style="display:block;width:${size}px;height:${size}px;border:0;outline:none;text-decoration:none;">`;

  return `<td valign="top" style="${cellStyle}">${img}</td>`;
}

export function renderSignatureFields(
  settings: EmailSettings,
  signature: string,
): { html: string; text: string } | null {
  if (!settings.signature.enabled) return null;

  const rendered = renderEmailMarkdown(signature, settings.appearance);
  const definition = SIGNATURE_TEMPLATES[settings.signature.template];
  const showLogo = definition.logoPosition !== "none" && Boolean(settings.signature.logoUrl);
  if (!showLogo && !rendered.html) return null;

  const textCellStyle = `vertical-align:top;${emailTextStyle(settings.appearance)}`;
  const body = rendered.html;
  const rows =
    showLogo && definition.logoPosition === "beside"
      ? `<tr>${logoCell(settings, definition, "padding:0 16px 0 0;")}${body ? `<td valign="top" style="${textCellStyle}">${body}</td>` : ""}</tr>`
      : showLogo
        ? `<tr>${logoCell(settings, definition, "padding:0 0 12px 0;")}</tr>${body ? `<tr><td valign="top" style="${textCellStyle}">${body}</td></tr>` : ""}`
        : `<tr><td valign="top" style="${textCellStyle}">${body}</td></tr>`;

  const html = `<table role="presentation" border="0" cellpadding="0" cellspacing="0" style="border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;max-width:${definition.maxWidthPx}px;">${rows}</table>`;

  return { html, text: rendered.text };
}
