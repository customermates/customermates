import { z } from "zod";

export const CONSENT_COOKIE_NAME = "cm_consent";
export const CONSENT_COOKIE_MAX_AGE = 180 * 24 * 60 * 60;

export const ConsentStateSchema = z.object({
  advertising: z.literal(false),
  analytics: z.boolean(),
  decidedAt: z.iso.datetime(),
  version: z.literal(1),
});

export type ConsentState = z.infer<typeof ConsentStateSchema>;

export function parseConsentState(value: string | null | undefined): ConsentState | null {
  if (!value) return null;

  try {
    return ConsentStateSchema.parse(JSON.parse(decodeURIComponent(value)));
  } catch {
    return null;
  }
}

export function consentCookie(state: ConsentState, secure: boolean): string {
  const value = encodeURIComponent(JSON.stringify(ConsentStateSchema.parse(state)));
  return [
    `${CONSENT_COOKIE_NAME}=${value}`,
    "Path=/",
    `Max-Age=${CONSENT_COOKIE_MAX_AGE}`,
    "SameSite=Lax",
    secure ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}
