import "server-only";

import { getInviteTokenValidationInteractor } from "@/core/di";
import { env } from "@/env";
import {
  decodeOnboardingIntent,
  encodeCreateCompanyOnboardingIntent,
  encodeInvitationOnboardingIntent,
  onboardingIntentSigningSecret,
} from "@/features/company/onboarding-intent-codec";

import { readInviteTokenCookie } from "./invite-token-cookie";

export type OnboardingIntentError =
  | "invalidInviteLink"
  | "invalidOnboardingIntent"
  | "inviteLinkExpired"
  | "onboardingSessionExpired";

type IntentSource = "explicit" | "legacy";

export type OnboardingIntentState =
  | { status: "absent" }
  | { errorMessage: OnboardingIntentError; source: IntentSource; status: "invalid" }
  | {
      authUserId: string;
      intent: string;
      source: IntentSource;
      status: "valid";
      type: "createCompany";
    }
  | {
      companyId: string;
      expiresAt: Date;
      intent: string;
      inviterName: string;
      source: IntentSource;
      status: "valid";
      token: string;
      type: "invitation";
    };

function signingSecret(): string {
  const secret = onboardingIntentSigningSecret(env.BETTER_AUTH_SECRET);
  if (!secret) throw new Error("BETTER_AUTH_SECRET is required to issue onboarding intents.");
  return secret;
}

export function issueInvitationOnboardingIntent(token: string, inviteExpiresAt: Date, now = new Date()): string | null {
  return encodeInvitationOnboardingIntent(token, inviteExpiresAt, signingSecret(), now);
}

export function issueCreateCompanyOnboardingIntent(authUserId: string, now = new Date()): string {
  const intent = encodeCreateCompanyOnboardingIntent(authUserId, signingSecret(), now);
  if (!intent) throw new Error("Could not issue company creation onboarding intent.");
  return intent;
}

async function validateInvitation(
  token: string,
  source: IntentSource,
  existingIntent?: string,
): Promise<OnboardingIntentState> {
  const result = await getInviteTokenValidationInteractor().invoke({ token });
  if (!result.ok) {
    return {
      errorMessage: "invalidInviteLink",
      source,
      status: "invalid",
    };
  }

  if (!result.data.valid) {
    return {
      errorMessage: result.data.errorMessage,
      source,
      status: "invalid",
    };
  }

  const intent = existingIntent ?? issueInvitationOnboardingIntent(token, result.data.expiresAt);
  if (!intent) {
    return {
      errorMessage: "inviteLinkExpired",
      source,
      status: "invalid",
    };
  }

  return {
    companyId: result.data.companyId,
    expiresAt: result.data.expiresAt,
    intent,
    inviterName: result.data.inviterName,
    source,
    status: "valid",
    token,
    type: "invitation",
  };
}

export async function resolveOnboardingIntent(value?: string | string[]): Promise<OnboardingIntentState> {
  if (value !== undefined) {
    if (typeof value !== "string" || value.length === 0)
      return { errorMessage: "invalidOnboardingIntent", source: "explicit", status: "invalid" };

    const decoded = decodeOnboardingIntent(value, signingSecret());
    if (decoded.status === "expired")
      return { errorMessage: "onboardingSessionExpired", source: "explicit", status: "invalid" };
    if (decoded.status === "invalid")
      return { errorMessage: "invalidOnboardingIntent", source: "explicit", status: "invalid" };

    if (decoded.payload.type === "invitation") return validateInvitation(decoded.payload.token, "explicit", value);

    return {
      authUserId: decoded.payload.authUserId,
      intent: value,
      source: "explicit",
      status: "valid",
      type: "createCompany",
    };
  }

  const legacyToken = await readInviteTokenCookie();
  if (legacyToken) return validateInvitation(legacyToken, "legacy");
  return { status: "absent" };
}
