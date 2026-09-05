import { z } from "zod";

import { hmacSha256Hex, verifyHmacSha256Hex } from "@/core/utils/hmac";

export const ONBOARDING_INTENT_MAX_AGE_MS = 2 * 60 * 60 * 1_000;
export const ONBOARDING_INTENT_VALUE_MAX_BYTES = 2_048;

const InvitationPayloadSchema = z.object({
  expiresAt: z.number().int().positive(),
  token: z
    .string()
    .min(1)
    .max(512)
    .regex(/^[a-zA-Z0-9_-]+$/),
  type: z.literal("invitation"),
});

const CreateCompanyPayloadSchema = z.object({
  authUserId: z.string().min(1).max(512),
  expiresAt: z.number().int().positive(),
  type: z.literal("createCompany"),
});

const OnboardingIntentPayloadSchema = z.discriminatedUnion("type", [
  InvitationPayloadSchema,
  CreateCompanyPayloadSchema,
]);

export type OnboardingIntentPayload = z.infer<typeof OnboardingIntentPayloadSchema>;

export type DecodedOnboardingIntent =
  | { status: "expired" }
  | { status: "invalid" }
  | { payload: OnboardingIntentPayload; status: "valid" };

export function onboardingIntentSigningSecret(secret: string | undefined): string | null {
  const trimmed = secret?.trim();
  return trimmed ? `onboarding-intent:v1:${trimmed}` : null;
}

function encodePayload(payload: OnboardingIntentPayload, secret: string): string | null {
  const parsed = OnboardingIntentPayloadSchema.safeParse(payload);
  if (!parsed.success) return null;

  const encodedPayload = Buffer.from(JSON.stringify(parsed.data)).toString("base64url");
  const encoded = `${encodedPayload}.${hmacSha256Hex(secret, encodedPayload)}`;

  return Buffer.byteLength(encoded, "utf8") <= ONBOARDING_INTENT_VALUE_MAX_BYTES ? encoded : null;
}

export function encodeInvitationOnboardingIntent(
  token: string,
  inviteExpiresAt: Date,
  secret: string,
  now = new Date(),
): string | null {
  const expiresAt = Math.min(inviteExpiresAt.getTime(), now.getTime() + ONBOARDING_INTENT_MAX_AGE_MS);
  if (!Number.isFinite(expiresAt) || expiresAt <= now.getTime()) return null;

  return encodePayload({ expiresAt, token, type: "invitation" }, secret);
}

export function encodeCreateCompanyOnboardingIntent(
  authUserId: string,
  secret: string,
  now = new Date(),
): string | null {
  return encodePayload(
    { authUserId, expiresAt: now.getTime() + ONBOARDING_INTENT_MAX_AGE_MS, type: "createCompany" },
    secret,
  );
}

export function decodeOnboardingIntent(
  value: string | undefined,
  secret: string,
  now = new Date(),
): DecodedOnboardingIntent {
  if (!value || Buffer.byteLength(value, "utf8") > ONBOARDING_INTENT_VALUE_MAX_BYTES) return { status: "invalid" };

  const parts = value.split(".");
  if (parts.length !== 2) return { status: "invalid" };

  const [payload, signature] = parts;
  if (!payload || !signature || !/^[0-9a-f]{64}$/u.test(signature)) return { status: "invalid" };

  try {
    if (!verifyHmacSha256Hex(secret, payload, signature)) return { status: "invalid" };

    const parsed = OnboardingIntentPayloadSchema.safeParse(
      JSON.parse(Buffer.from(payload, "base64url").toString("utf8")),
    );
    if (!parsed.success) return { status: "invalid" };
    if (parsed.data.expiresAt <= now.getTime()) return { status: "expired" };
    if (parsed.data.expiresAt > now.getTime() + ONBOARDING_INTENT_MAX_AGE_MS) return { status: "invalid" };

    return { payload: parsed.data, status: "valid" };
  } catch {
    return { status: "invalid" };
  }
}
