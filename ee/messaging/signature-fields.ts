import { z } from "zod";

export enum SignatureTemplate {
  plain = "plain",
  stacked = "stacked",
  sideBySide = "sideBySide",
}

export enum SignatureAccent {
  neutral = "neutral",
  violet = "violet",
  blue = "blue",
  green = "green",
}

export const SIGNATURE_LOGO_URL = "https://customermates.com/images/email/customermates-icon@2x.png";

const SIGNATURE_IMAGE_PATH = /\.(apng|avif|bmp|gif|ico|jpe?g|png|webp)(\?\S*)?$/i;

const line = z.string().trim().max(120);

export function isSignatureImageUrl(value: string): boolean {
  return value.startsWith("https://") && SIGNATURE_IMAGE_PATH.test(value);
}

export const SignatureFieldsSchema = z.object({
  template: z.enum(SignatureTemplate).default(SignatureTemplate.stacked),
  accent: z.enum(SignatureAccent).default(SignatureAccent.violet),
  fullName: line.default(""),
  jobTitle: line.default(""),
  company: line.default(""),
  email: line.default(""),
  phone: line.default(""),
  website: line.default(""),
  logoUrl: z.union([z.literal(""), z.string().max(500).refine(isSignatureImageUrl)]).default(""),
});

export type SignatureFields = z.infer<typeof SignatureFieldsSchema>;

export function parseSignatureFields(value: unknown): SignatureFields | null {
  return SignatureFieldsSchema.nullable()
    .catch(null)
    .parse(value ?? null);
}

export function emptySignatureFields(): SignatureFields {
  return SignatureFieldsSchema.parse({});
}
