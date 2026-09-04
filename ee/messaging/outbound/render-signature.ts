import type { SignatureFields } from "../signature-fields";

import markdownit from "markdown-it";

import { SignatureAccent, SignatureTemplate } from "../signature-fields";

type SignatureTemplateDefinition = {
  logoPosition: "none" | "above" | "beside";
  logoPx: number;
  maxWidthPx: number;
};

export const SIGNATURE_TEMPLATES: Record<SignatureTemplate, SignatureTemplateDefinition> = {
  [SignatureTemplate.plain]: { logoPosition: "none", logoPx: 0, maxWidthPx: 460 },
  [SignatureTemplate.stacked]: { logoPosition: "above", logoPx: 48, maxWidthPx: 460 },
  [SignatureTemplate.sideBySide]: { logoPosition: "beside", logoPx: 56, maxWidthPx: 520 },
};

const ACCENT_HEX: Record<SignatureAccent, string> = {
  [SignatureAccent.neutral]: "#6e6e6e",
  [SignatureAccent.violet]: "#7161e8",
  [SignatureAccent.blue]: "#3d7dbf",
  [SignatureAccent.green]: "#2ba449",
};

const NAME_COLOR = "#6e6e6e";
const TEXT_COLOR = "#7a7a7a";
const DIVIDER_COLOR = "#8a8a8a";
const FONT_STACK = "Arial,Helvetica,sans-serif";
const BODY_STYLE = `font-family:${FONT_STACK};font-size:13px;line-height:19px;mso-line-height-rule:exactly;color:${TEXT_COLOR};`;
const NAME_STYLE = `font-family:${FONT_STACK};font-size:14px;line-height:20px;mso-line-height-rule:exactly;font-weight:bold;color:${NAME_COLOR};`;
const WEBSITE_LABEL_MAX = 40;

type MarkdownEnv = { accentHex?: string };

export const signatureMarkdown = markdownit({ html: false, linkify: true, breaks: true });

type RenderRule = NonNullable<typeof signatureMarkdown.renderer.rules.link_open>;

const renderToken: RenderRule = (tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options);

const baseLinkOpen = signatureMarkdown.renderer.rules.link_open ?? renderToken;
const baseParagraphOpen = signatureMarkdown.renderer.rules.paragraph_open ?? renderToken;
const baseImage = signatureMarkdown.renderer.rules.image ?? renderToken;

signatureMarkdown.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const href = token.attrGet("href");
  if (href && token.markup === "linkify" && href.startsWith("http://"))
    token.attrSet("href", `https://${href.slice("http://".length)}`);

  const accentHex = (env as MarkdownEnv | undefined)?.accentHex;
  if (accentHex) token.attrSet("style", `color:${accentHex};text-decoration:underline;`);

  return baseLinkOpen(tokens, idx, options, env, self);
};

signatureMarkdown.renderer.rules.paragraph_open = (tokens, idx, options, env, self) => {
  if ((env as MarkdownEnv | undefined)?.accentHex) tokens[idx].attrSet("style", "margin:0;padding:0;");

  return baseParagraphOpen(tokens, idx, options, env, self);
};

signatureMarkdown.renderer.rules.image = (tokens, idx, options, env, self) => {
  if ((env as MarkdownEnv | undefined)?.accentHex) {
    tokens[idx].attrSet("border", "0");
    tokens[idx].attrSet("style", "max-width:100%;border:0;outline:none;text-decoration:none;");
  }

  return baseImage(tokens, idx, options, env, self);
};

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function signatureToHtml(signature: string, accentHex?: string): string {
  return signatureMarkdown.render(signature, accentHex ? { accentHex } : {}).trim();
}

function telHref(phone: string): string {
  return phone.replace(/[^\d+]/g, "");
}

function siteHref(website: string): string {
  return /^https?:\/\//i.test(website) ? website : `https://${website}`;
}

function websiteLabel(website: string): string {
  const bare = website.replace(/^https?:\/\//i, "").replace(/\/$/, "");
  return bare.length > WEBSITE_LABEL_MAX ? `${bare.slice(0, WEBSITE_LABEL_MAX - 1)}…` : bare;
}

function link(href: string, label: string, accentHex: string): string {
  return `<a href="${escapeHtml(href)}" style="color:${accentHex};text-decoration:underline;">${escapeHtml(label)}</a>`;
}

function row(style: string, inner: string): string {
  return `<div style="${style}">${inner}</div>`;
}

function textBlock(fields: SignatureFields, markdown: string, accentHex: string): string {
  const rows: string[] = [];

  if (fields.fullName) rows.push(row(NAME_STYLE, escapeHtml(fields.fullName)));

  const role = [fields.jobTitle, fields.company].filter(Boolean).join(", ");
  if (role) rows.push(row(BODY_STYLE, escapeHtml(role)));

  if (fields.phone) rows.push(row(BODY_STYLE, link(`tel:${telHref(fields.phone)}`, fields.phone, accentHex)));
  if (fields.email) rows.push(row(BODY_STYLE, link(`mailto:${fields.email}`, fields.email, accentHex)));
  if (fields.website)
    rows.push(row(BODY_STYLE, link(siteHref(fields.website), websiteLabel(fields.website), accentHex)));

  if (markdown) rows.push(row(BODY_STYLE, signatureToHtml(markdown, accentHex)));

  return rows.join("");
}

function logoCell(fields: SignatureFields, definition: SignatureTemplateDefinition, extraStyle: string): string {
  const size = definition.logoPx;
  const alt = fields.company || fields.fullName || "";
  const cellStyle = `font-size:0;line-height:0;mso-line-height-rule:exactly;vertical-align:top;${extraStyle}`;
  const img = `<img src="${escapeHtml(fields.logoUrl)}" width="${size}" height="${size}" alt="${escapeHtml(alt)}" border="0" style="display:block;width:${size}px;height:${size}px;border:0;outline:none;text-decoration:none;">`;

  return `<td valign="top" style="${cellStyle}">${img}</td>`;
}

function demark(markdown: string): string {
  return markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\(([^)]*)\)/g, "$1 ($2)")
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/(\*|_)(.+?)\1/g, "$2")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}[-*+]\s+/gm, "")
    .replace(/^\s{0,3}([-*_])\s*(?:\1\s*){2,}$/gm, "")
    .split("\n")
    .map((textLine) => textLine.trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function plainTextBlock(fields: SignatureFields, markdown: string): string {
  const role = [fields.jobTitle, fields.company].filter(Boolean).join(", ");

  return [
    fields.fullName,
    role,
    fields.phone,
    fields.email,
    fields.website ? siteHref(fields.website) : "",
    demark(markdown),
  ]
    .filter(Boolean)
    .join("\n");
}

export function renderSignatureFields(
  fields: SignatureFields,
  signature: string,
): { html: string; text: string } | null {
  const markdown = signature.trim();
  const text = plainTextBlock(fields, markdown);
  if (!text) return null;

  const definition = SIGNATURE_TEMPLATES[fields.template];
  const accentHex = ACCENT_HEX[fields.accent];
  const showLogo = definition.logoPosition !== "none" && Boolean(fields.logoUrl);
  const body = textBlock(fields, markdown, accentHex);
  const textCellStyle = `vertical-align:top;${BODY_STYLE}`;

  const rows =
    showLogo && definition.logoPosition === "beside"
      ? `<tr>${logoCell(fields, definition, `padding:0 14px 0 0;border-right:1px solid ${DIVIDER_COLOR};`)}<td valign="top" style="${textCellStyle}padding:0 0 0 14px;">${body}</td></tr>`
      : showLogo
        ? `<tr>${logoCell(fields, definition, "padding:0 0 10px 0;")}</tr><tr><td valign="top" style="${textCellStyle}border-top:1px solid ${DIVIDER_COLOR};padding:10px 0 0 0;">${body}</td></tr>`
        : `<tr><td valign="top" style="${textCellStyle}">${body}</td></tr>`;

  const html = `<table role="presentation" border="0" cellpadding="0" cellspacing="0" style="border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;max-width:${definition.maxWidthPx}px;">${rows}</table>`;

  return { html, text };
}
