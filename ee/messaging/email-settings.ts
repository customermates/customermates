import { z } from "zod";

export enum SignatureTemplate {
  plain = "plain",
  stacked = "stacked",
  sideBySide = "sideBySide",
}

export enum EmailFontFamily {
  sansSerif = "sansSerif",
  serif = "serif",
  monospace = "monospace",
}

export enum EmailLinkStyle {
  underlined = "underlined",
  plain = "plain",
}

export const EMAIL_FONT_STACK: Record<EmailFontFamily, string> = {
  [EmailFontFamily.sansSerif]: "Arial,Helvetica,sans-serif",
  [EmailFontFamily.serif]: "Georgia,'Times New Roman',serif",
  [EmailFontFamily.monospace]: "'Courier New',Courier,monospace",
};

export const SIGNATURE_LOGO_URL = "https://customermates.com/images/email/customermates-icon@2x.png";
export const DEFAULT_LINK_HEX = "#7161e8";

export const EMAIL_LINK_COLOR_PRESETS = [
  DEFAULT_LINK_HEX,
  "#3d7dbf",
  "#2ba449",
  "#d27b00",
  "#d23128",
  "#6e6e6e",
] as const;

export const EMAIL_FONT_SIZE_MIN = 10;
export const EMAIL_FONT_SIZE_MAX = 20;

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const EXPLICIT_URL_SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const SAFE_EMAIL_LINK_SCHEME = /^(?:https?:|mailto:|tel:)/i;

export function normalizeEmailLinkUrl(value: string): string | null {
  const source = value.trim();
  if (!source) return null;
  if (SAFE_EMAIL_LINK_SCHEME.test(source)) return source;
  if (EXPLICIT_URL_SCHEME.test(source) || /\s/.test(source)) return null;

  try {
    const url = new URL(`https://${source}`);
    return url.hostname.includes(".") ? url.href : null;
  } catch {
    return null;
  }
}

function isPublicIpv4(hostname: string): boolean | null {
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)) return null;
  const octets = hostname.split(".").map(Number);
  if (octets.some((octet) => octet > 255)) return false;

  const [a, b, c] = octets;
  return !(
    a === 0 ||
    a === 10 ||
    (a === 100 && b >= 64 && b <= 127) ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

function isPublicIpv6(hostname: string): boolean | null {
  if (!hostname.includes(":")) return null;
  const normalized = hostname.toLowerCase();
  if (normalized.startsWith("::")) return false;
  if (/^(?:fc|fd|fe[c-f]|fe[89ab]|ff|2001:db8:)/.test(normalized)) return false;
  return true;
}

export function isPublicEmailImageUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const hostname = url.hostname
      .toLowerCase()
      .replace(/^\[|\]$/g, "")
      .replace(/\.$/, "");
    if (url.protocol !== "https:" || !hostname || url.username || url.password) return false;
    if (
      ["localhost", "internal", "lan", "home.arpa"].includes(hostname) ||
      [
        ".localhost",
        ".local",
        ".internal",
        ".lan",
        ".home",
        ".home.arpa",
        ".corp",
        ".test",
        ".invalid",
        ".example",
        ".onion",
      ].some((suffix) => hostname.endsWith(suffix)) ||
      /^\d{1,3}(?:\.\d{1,3}){3}\./.test(hostname)
    )
      return false;
    const publicIpv4 = isPublicIpv4(hostname);
    if (publicIpv4 !== null) return publicIpv4;
    const publicIpv6 = isPublicIpv6(hostname);
    if (publicIpv6 !== null) return publicIpv6;
    return hostname.includes(".");
  } catch {
    return false;
  }
}

function channelLuminance(hex: string, start: number): number {
  const value = parseInt(hex.slice(start, start + 2), 16) / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  return 0.2126 * channelLuminance(hex, 1) + 0.7152 * channelLuminance(hex, 3) + 0.0722 * channelLuminance(hex, 5);
}

export function contrastRatio(hex: string, background: string): number {
  const a = relativeLuminance(hex);
  const b = relativeLuminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

export const EMAIL_LINK_CONTRAST_FLOOR = 3;
const LIGHT_MAIL_SURFACE = "#ffffff";
const DARK_MAIL_SURFACE = "#1f1f1f";

export function emailLinkContrast(hex: string): {
  light: number;
  dark: number;
  readable: boolean;
} {
  const light = contrastRatio(hex, LIGHT_MAIL_SURFACE);
  const dark = contrastRatio(hex, DARK_MAIL_SURFACE);

  return {
    light,
    dark,
    readable: light >= EMAIL_LINK_CONTRAST_FLOOR && dark >= EMAIL_LINK_CONTRAST_FLOOR,
  };
}

const EmailAppearanceSchema = z.object({
  fontFamily: z.enum(EmailFontFamily),
  fontSize: z.number().int().min(EMAIL_FONT_SIZE_MIN).max(EMAIL_FONT_SIZE_MAX),
  linkHex: z.string().regex(HEX_COLOR),
  linkStyle: z.enum(EmailLinkStyle),
});

const EmailSignatureSchema = z.object({
  enabled: z.boolean(),
  template: z.enum(SignatureTemplate),
  logoUrl: z.string().max(500),
});

export const EmailSettingsSchema = z
  .object({
    version: z.literal(2),
    appearance: EmailAppearanceSchema,
    signature: EmailSignatureSchema,
  })
  .superRefine((settings, ctx) => {
    if (
      settings.signature.enabled &&
      settings.signature.template !== SignatureTemplate.plain &&
      !isPublicEmailImageUrl(settings.signature.logoUrl)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["signature", "logoUrl"],
        message: "A public logo URL is required",
      });
    }
  });

export type EmailSettings = z.infer<typeof EmailSettingsSchema>;

export function defaultEmailSettings(): EmailSettings {
  return {
    version: 2,
    appearance: {
      fontFamily: EmailFontFamily.sansSerif,
      fontSize: 13,
      linkHex: DEFAULT_LINK_HEX,
      linkStyle: EmailLinkStyle.underlined,
    },
    signature: {
      enabled: false,
      template: SignatureTemplate.stacked,
      logoUrl: SIGNATURE_LOGO_URL,
    },
  };
}

const legacyLine = z.string().trim().max(120).catch("");
const LegacySignatureFieldsSchema = z.object({
  template: z.enum(SignatureTemplate).catch(SignatureTemplate.stacked),
  accentHex: z.string().regex(HEX_COLOR).catch(DEFAULT_LINK_HEX),
  fontSize: z.number().int().min(EMAIL_FONT_SIZE_MIN).max(EMAIL_FONT_SIZE_MAX).catch(13),
  fontWeight: z.enum(["normal", "medium", "semibold", "bold"]).catch("bold"),
  fullName: legacyLine,
  jobTitle: legacyLine,
  company: legacyLine,
  email: legacyLine,
  phone: legacyLine,
  website: legacyLine,
  logoUrl: z.union([z.literal(""), z.string().max(500).refine(isPublicEmailImageUrl)]).catch(""),
});

const LEGACY_ACCENT_HEX: Record<string, string> = {
  neutral: "#6e6e6e",
  violet: DEFAULT_LINK_HEX,
  blue: "#3d7dbf",
  green: "#2ba449",
};

function upgradeLegacyAccent(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;

  const record = value as Record<string, unknown>;
  if (typeof record.accentHex === "string" || typeof record.accent !== "string") return value;

  const { accent, ...rest } = record;
  return { ...rest, accentHex: LEGACY_ACCENT_HEX[accent] ?? DEFAULT_LINK_HEX };
}

function escapeMarkdownText(value: string): string {
  return value.replace(/([\\`*_[\]<>])/g, "\\$1");
}

function telHref(phone: string): string {
  return phone.replace(/[^\d+]/g, "");
}

function siteHref(website: string): string {
  if (/^https:\/\//i.test(website)) return website;
  if (/^http:\/\//i.test(website)) return `https://${website.slice("http://".length)}`;
  return `https://${website}`;
}

function legacySignatureMarkdown(fields: z.infer<typeof LegacySignatureFieldsSchema>, markdown: string): string {
  const role = [fields.jobTitle, fields.company].filter(Boolean).map(escapeMarkdownText).join(", ");
  const name = escapeMarkdownText(fields.fullName);
  const renderedName = ["semibold", "bold"].includes(fields.fontWeight) ? `**${name}**` : name;
  const rows = [
    fields.fullName ? renderedName : "",
    role,
    fields.phone ? `[${escapeMarkdownText(fields.phone)}](tel:${telHref(fields.phone)})` : "",
    fields.email ? `[${escapeMarkdownText(fields.email)}](mailto:${fields.email})` : "",
    fields.website ? `[${escapeMarkdownText(fields.website)}](${siteHref(fields.website)})` : "",
    markdown.trim(),
  ];

  return rows.filter(Boolean).join("  \n");
}

export type ResolvedEmailSettings = {
  markdown: string;
  settings: EmailSettings;
  migratedLegacyFields: boolean;
};

export function resolveStoredEmailSettings(markdown: string | null | undefined, value: unknown): ResolvedEmailSettings {
  const source = markdown?.trim() ?? "";
  const parsed = EmailSettingsSchema.safeParse(value);
  if (parsed.success) {
    return {
      markdown: source,
      settings: parsed.data,
      migratedLegacyFields: false,
    };
  }

  const legacy = LegacySignatureFieldsSchema.safeParse(upgradeLegacyAccent(value));
  if (legacy.success) {
    const converted = legacySignatureMarkdown(legacy.data, source);
    const settings = defaultEmailSettings();
    settings.appearance.fontSize = legacy.data.fontSize;
    settings.appearance.linkHex = legacy.data.accentHex;
    settings.signature = {
      enabled: Boolean(converted),
      template: legacy.data.logoUrl ? legacy.data.template : SignatureTemplate.plain,
      logoUrl: legacy.data.logoUrl,
    };

    return { markdown: converted, settings, migratedLegacyFields: true };
  }

  const settings = defaultEmailSettings();
  settings.signature.enabled = Boolean(source);
  settings.signature.template = SignatureTemplate.plain;
  settings.signature.logoUrl = "";
  return { markdown: source, settings, migratedLegacyFields: Boolean(source) };
}
