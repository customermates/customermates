import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";

import { CustomErrorCode } from "@/core/validation/validation.types";

import { isBrandColor } from "./brand-color";
import { BRAND_LOGO_MAX_BYTES } from "./brand-image";

export const BRAND_LOGO_KEY = /^[A-Za-z0-9_-]{16,64}$/u;
const BRAND_LOGO_BASE64_MAX_CHARS = Math.ceil(BRAND_LOGO_MAX_BYTES / 3) * 4 + 4096;

export type PublicBrand = { logoUrl: string | null; accentColor: string | null };

export const WorkspaceBrandSchema = z
  .object({
    accentColor: z.string().nullable(),
    logoUrl: z.string().nullable(),
  })
  .strict();
export type WorkspaceBrand = Data<typeof WorkspaceBrandSchema>;

export const SaveWorkspaceBrandSchema = z
  .object({
    accentColor: z
      .string()
      .refine(isBrandColor, { params: { error: CustomErrorCode.emailLinkColourInvalid } })
      .nullable()
      .optional(),
    logo: z
      .string()
      .min(1)
      .max(BRAND_LOGO_BASE64_MAX_CHARS)
      .nullable()
      .optional()
      .describe("The image as base64: PNG, JPEG or WebP, at most 512 KB. Null removes the logo."),
  })
  .strict();
export type SaveWorkspaceBrandData = Data<typeof SaveWorkspaceBrandSchema>;

export function brandLogoUrl(logoKey: string): string {
  return `/api/brand/logo/${logoKey}`;
}

export function publicBrand(
  stored: { accentColor: string | null; logoKey: string | null } | null | undefined,
): PublicBrand | null {
  if (!stored || (!stored.accentColor && !stored.logoKey)) return null;
  return {
    logoUrl: stored.logoKey ? brandLogoUrl(stored.logoKey) : null,
    accentColor: isBrandColor(stored.accentColor) ? stored.accentColor : null,
  };
}
