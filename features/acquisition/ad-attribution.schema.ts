import type { z } from "zod";

import { array, boolean, date, iso, literal, object, string, enum as zodEnum } from "zod";

import { AD_IDENTIFIER_KINDS, AD_PROVIDER_ORDER, type AdIdentifierKind } from "./ad-provider-registry";

export const AdProviderSchema = zodEnum(AD_PROVIDER_ORDER);
export const AdIdentifierKindSchema = zodEnum(AD_IDENTIFIER_KINDS as [AdIdentifierKind, ...AdIdentifierKind[]]);

export {
  PUBLIC_AD_ATTRIBUTION_COOKIE_MAX_AGE_SECONDS,
  PUBLIC_AD_ATTRIBUTION_COOKIE_NAME,
  PUBLIC_AD_ATTRIBUTION_PENDING_FUTURE_SKEW_SECONDS,
  PUBLIC_AD_ATTRIBUTION_PENDING_MAX_AGE_SECONDS,
  PUBLIC_AD_ATTRIBUTION_PENDING_PARAM,
} from "./ad-attribution.constants";

export const adIdentifierValueSchema = string()
  .min(1)
  .max(512)
  .regex(/^[^\p{Cc}\p{Cf}\p{Z}=+@][^\p{Cc}\p{Cf}\p{Z}]*$/u);

export const AdClickSchema = object({
  provider: AdProviderSchema,
  kind: AdIdentifierKindSchema,
  value: adIdentifierValueSchema,
  clickedAt: iso.datetime(),
});
export type AdClick = z.infer<typeof AdClickSchema>;

export const RetainedAdClickSchema = AdClickSchema.extend({
  capturedAt: iso.datetime(),
  expiresAt: iso.datetime(),
});
export type RetainedAdClick = z.infer<typeof RetainedAdClickSchema>;

export const PublicAdAttributionConsentSchema = object({
  advertising: boolean(),
  decidedAt: iso.datetime(),
  noticeVersion: string().min(1).max(32),
});
export type PublicAdAttributionConsent = z.infer<typeof PublicAdAttributionConsentSchema>;

export const PublicAdAttributionCookieSchema = object({
  version: literal(1),
  consent: PublicAdAttributionConsentSchema,
  clicks: array(RetainedAdClickSchema).max(AD_PROVIDER_ORDER.length),
  expiresAt: iso.datetime(),
});
export type PublicAdAttributionCookie = z.infer<typeof PublicAdAttributionCookieSchema>;

export const PublicAdAttributionSearchInputSchema = object({ search: string().max(2048) });

export const PublicAdAttributionVisitInputSchema = PublicAdAttributionSearchInputSchema.extend({
  pendingAt: iso.datetime(),
});
export type PublicAdAttributionVisitInput = z.infer<typeof PublicAdAttributionVisitInputSchema>;

export const PublicAdAttributionDecisionInputSchema = object({
  choice: zodEnum(["allow-attribution", "necessary-only"]),
  visit: PublicAdAttributionVisitInputSchema.nullable(),
});
export type PublicAdAttributionDecisionInput = z.input<typeof PublicAdAttributionDecisionInputSchema>;
export type PublicAdAttributionDecisionData = z.output<typeof PublicAdAttributionDecisionInputSchema>;

export const RegistrationAdAttributionSchema = object({
  provider: AdProviderSchema,
  identifierKind: AdIdentifierKindSchema,
  identifierValue: adIdentifierValueSchema,
  clickedAt: date(),
  capturedAt: date(),
  consentedAt: date(),
  consentNoticeVersion: string().min(1).max(32),
  expiresAt: date(),
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
