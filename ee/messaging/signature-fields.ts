import { z } from "zod";

export enum SignatureTemplate {
  plain = "plain",
  stacked = "stacked",
  sideBySide = "sideBySide",
}

export enum SignatureWeight {
  normal = "normal",
  medium = "medium",
  semibold = "semibold",
  bold = "bold",
}

export const SIGNATURE_WEIGHT_VALUE: Record<SignatureWeight, number> = {
  [SignatureWeight.normal]: 400,
  [SignatureWeight.medium]: 500,
  [SignatureWeight.semibold]: 600,
  [SignatureWeight.bold]: 700,
};

export const SIGNATURE_LOGO_URL = "https://customermates.com/images/email/customermates-icon@2x.png";

export const DEFAULT_ACCENT_HEX = "#7161e8";

export const SIGNATURE_ACCENT_PRESETS = [
  DEFAULT_ACCENT_HEX,
  "#3d7dbf",
  "#2ba449",
  "#d27b00",
  "#d23128",
  "#6e6e6e",
] as const;

export const SIGNATURE_FONT_SIZE_MIN = 10;
export const SIGNATURE_FONT_SIZE_MAX = 20;

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const SIGNATURE_IMAGE_PATH = /\.(apng|avif|bmp|gif|ico|jpe?g|png|webp)(\?\S*)?$/i;

const line = z.string().trim().max(120);

export function isSignatureImageUrl(value: string): boolean {
  return value.startsWith("https://") && SIGNATURE_IMAGE_PATH.test(value);
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

export const SIGNATURE_CONTRAST_FLOOR = 3;
const LIGHT_MAIL_SURFACE = "#ffffff";
const DARK_MAIL_SURFACE = "#1f1f1f";

export function signatureContrast(hex: string): { light: number; dark: number; readable: boolean } {
  const light = contrastRatio(hex, LIGHT_MAIL_SURFACE);
  const dark = contrastRatio(hex, DARK_MAIL_SURFACE);

  return { light, dark, readable: light >= SIGNATURE_CONTRAST_FLOOR && dark >= SIGNATURE_CONTRAST_FLOOR };
}

export const SignatureFieldsSchema = z.object({
  template: z.enum(SignatureTemplate).default(SignatureTemplate.stacked),
  accentHex: z.string().regex(HEX_COLOR).default(DEFAULT_ACCENT_HEX),
  fontSize: z.number().int().min(SIGNATURE_FONT_SIZE_MIN).max(SIGNATURE_FONT_SIZE_MAX).default(13),
  fontWeight: z.enum(SignatureWeight).default(SignatureWeight.bold),
  fullName: line.default(""),
  jobTitle: line.default(""),
  company: line.default(""),
  email: line.default(""),
  phone: line.default(""),
  website: line.default(""),
  logoUrl: z.union([z.literal(""), z.string().max(500).refine(isSignatureImageUrl)]).default(""),
});

export type SignatureFields = z.infer<typeof SignatureFieldsSchema>;

const LEGACY_ACCENT_HEX: Record<string, string> = {
  neutral: "#6e6e6e",
  violet: DEFAULT_ACCENT_HEX,
  blue: "#3d7dbf",
  green: "#2ba449",
};

function upgradeLegacyAccent(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;

  const record = value as Record<string, unknown>;
  if (typeof record.accentHex === "string" || typeof record.accent !== "string") return value;

  const { accent, ...rest } = record;
  return { ...rest, accentHex: LEGACY_ACCENT_HEX[accent] ?? DEFAULT_ACCENT_HEX };
}

export function parseSignatureFields(value: unknown): SignatureFields | null {
  return SignatureFieldsSchema.nullable()
    .catch(null)
    .parse(upgradeLegacyAccent(value ?? null) ?? null);
}

export function emptySignatureFields(): SignatureFields {
  return SignatureFieldsSchema.parse({});
}
