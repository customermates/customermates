import { z } from "zod";

export const PUBLIC_GOOGLE_ADS_COOKIE_NAME = "cm_google_ads_attribution";
export const PUBLIC_GOOGLE_ADS_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 90;
export const GOOGLE_ADS_CLICK_ID_RETENTION_SECONDS = 60 * 60 * 24 * 89;

export const GoogleAdsClickIdKindSchema = z.enum(["gclid", "gbraid", "wbraid"]);
export type GoogleAdsClickIdKind = z.infer<typeof GoogleAdsClickIdKindSchema>;

const clickIdValueSchema = z
  .string()
  .min(1)
  .max(512)
  .regex(/^[^\p{Cc}\p{Cf}\p{Z}]+$/u);

export const GoogleAdsClickSchema = z.object({
  kind: GoogleAdsClickIdKindSchema,
  value: clickIdValueSchema,
  capturedAt: z.iso.datetime(),
});
export type GoogleAdsClick = z.infer<typeof GoogleAdsClickSchema>;

export const PublicGoogleAdsConsentSchema = z.object({
  advertising: z.boolean(),
  decidedAt: z.iso.datetime(),
});
export type PublicGoogleAdsConsent = z.infer<typeof PublicGoogleAdsConsentSchema>;

export const PublicGoogleAdsCookieSchema = z.object({
  version: z.literal(1),
  consent: PublicGoogleAdsConsentSchema,
  click: GoogleAdsClickSchema.nullable(),
  expiresAt: z.iso.datetime(),
});
export type PublicGoogleAdsCookie = z.infer<typeof PublicGoogleAdsCookieSchema>;

export const PublicGoogleAdsVisitInputSchema = z.object({
  search: z.string().max(2048),
});
export type PublicGoogleAdsVisitInput = z.infer<typeof PublicGoogleAdsVisitInputSchema>;

export const PublicGoogleAdsConsentDecisionInputSchema = z.object({
  choice: z.enum(["allow-attribution", "necessary-only"]),
  visit: PublicGoogleAdsVisitInputSchema.nullable(),
});
export type PublicGoogleAdsConsentDecisionInput = z.input<typeof PublicGoogleAdsConsentDecisionInputSchema>;

export const RegistrationGoogleAdsAttributionSchema = z
  .object({
    clickId: clickIdValueSchema,
    clickIdKind: GoogleAdsClickIdKindSchema,
    capturedAt: z.date(),
    consentedAt: z.date(),
    expiresAt: z.date(),
  })
  .refine((value) => value.consentedAt <= value.capturedAt, {
    message: "Google Ads click capture cannot predate consent",
    path: ["consentedAt"],
  })
  .refine((value) => value.expiresAt > value.capturedAt, {
    message: "Google Ads click expiry must follow capture",
    path: ["expiresAt"],
  });
export type RegistrationGoogleAdsAttribution = z.infer<typeof RegistrationGoogleAdsAttributionSchema>;

export function normalizeGoogleAdsClick(input: unknown, capturedAt = new Date()): GoogleAdsClick | null {
  const parsed = PublicGoogleAdsVisitInputSchema.safeParse(input);
  if (!parsed.success) return null;

  const search = parsed.data.search.startsWith("?") ? parsed.data.search.slice(1) : parsed.data.search;
  const params = new URLSearchParams(search);
  const candidates = GoogleAdsClickIdKindSchema.options.flatMap((kind) =>
    params.getAll(kind).map((value) => ({ kind, value })),
  );
  if (candidates.length !== 1) return null;
  const value = clickIdValueSchema.safeParse(candidates[0]?.value);
  if (!value.success) return null;

  return GoogleAdsClickSchema.parse({
    kind: candidates[0]?.kind,
    value: value.data,
    capturedAt: capturedAt.toISOString(),
  });
}

export function buildPublicGoogleAdsCookieDecision(args: {
  existing: PublicGoogleAdsCookie | null;
  input: z.output<typeof PublicGoogleAdsConsentDecisionInputSchema>;
  now: Date;
}): PublicGoogleAdsCookie {
  const advertising = args.input.choice === "allow-attribution";
  const existingAllowed = args.existing?.consent.advertising === true ? args.existing : null;
  const consent =
    advertising && existingAllowed ? existingAllowed.consent : { advertising, decidedAt: args.now.toISOString() };
  const expiresAt =
    advertising && existingAllowed
      ? existingAllowed.expiresAt
      : new Date(args.now.getTime() + PUBLIC_GOOGLE_ADS_COOKIE_MAX_AGE_SECONDS * 1000).toISOString();

  return PublicGoogleAdsCookieSchema.parse({
    version: 1,
    consent,
    click: advertising ? (existingAllowed?.click ?? normalizeGoogleAdsClick(args.input.visit, args.now)) : null,
    expiresAt,
  });
}
