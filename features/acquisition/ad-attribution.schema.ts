import { z } from "zod";

import { AD_PROVIDER_ORDER, AdIdentifierKindSchema, AdProviderSchema } from "./ad-provider-registry";

export const PUBLIC_AD_ATTRIBUTION_COOKIE_NAME = "cm_ad_attribution";
export const PUBLIC_AD_ATTRIBUTION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 90;
export const PUBLIC_AD_ATTRIBUTION_PENDING_PARAM = "cm_ads_pending";
export const PUBLIC_AD_ATTRIBUTION_PENDING_MAX_AGE_SECONDS = 60 * 60 * 24;
export const PUBLIC_AD_ATTRIBUTION_PENDING_FUTURE_SKEW_SECONDS = 60 * 5;

export const adIdentifierValueSchema = z
  .string()
  .min(1)
  .max(512)
  .regex(/^[^\p{Cc}\p{Cf}\p{Z}=+@][^\p{Cc}\p{Cf}\p{Z}]*$/u);

export const AdClickSchema = z.object({
  provider: AdProviderSchema,
  kind: AdIdentifierKindSchema,
  value: adIdentifierValueSchema,
  clickedAt: z.iso.datetime(),
});
export type AdClick = z.infer<typeof AdClickSchema>;

export const RetainedAdClickSchema = AdClickSchema.extend({
  capturedAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
});
export type RetainedAdClick = z.infer<typeof RetainedAdClickSchema>;

export const PublicAdAttributionConsentSchema = z.object({
  advertising: z.boolean(),
  decidedAt: z.iso.datetime(),
  noticeVersion: z.string().min(1).max(32),
});
export type PublicAdAttributionConsent = z.infer<typeof PublicAdAttributionConsentSchema>;

export const PublicAdAttributionCookieSchema = z.object({
  version: z.literal(1),
  consent: PublicAdAttributionConsentSchema,
  clicks: z.array(RetainedAdClickSchema).max(AD_PROVIDER_ORDER.length),
  expiresAt: z.iso.datetime(),
});
export type PublicAdAttributionCookie = z.infer<typeof PublicAdAttributionCookieSchema>;

export const PublicAdAttributionSearchInputSchema = z.object({ search: z.string().max(2048) });

export const PublicAdAttributionVisitInputSchema = PublicAdAttributionSearchInputSchema.extend({
  pendingAt: z.iso.datetime(),
});
export type PublicAdAttributionVisitInput = z.infer<typeof PublicAdAttributionVisitInputSchema>;

export const PublicAdAttributionDecisionInputSchema = z.object({
  choice: z.enum(["allow-attribution", "necessary-only"]),
  visit: PublicAdAttributionVisitInputSchema.nullable(),
});
export type PublicAdAttributionDecisionInput = z.input<typeof PublicAdAttributionDecisionInputSchema>;
export type PublicAdAttributionDecisionData = z.output<typeof PublicAdAttributionDecisionInputSchema>;

export const RegistrationAdAttributionSchema = z
  .object({
    provider: AdProviderSchema,
    identifierKind: AdIdentifierKindSchema,
    identifierValue: adIdentifierValueSchema,
    clickedAt: z.date(),
    capturedAt: z.date(),
    consentedAt: z.date(),
    consentNoticeVersion: z.string().min(1).max(32),
    expiresAt: z.date(),
  })
  .refine((value) => value.clickedAt <= value.capturedAt, {
    message: "Ad click capture cannot predate the click",
    path: ["capturedAt"],
  })
  .refine((value) => value.expiresAt > value.clickedAt, {
    message: "Ad click expiry must follow the click",
    path: ["expiresAt"],
  });
export type RegistrationAdAttribution = z.infer<typeof RegistrationAdAttributionSchema>;
