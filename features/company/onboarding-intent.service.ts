import type { InviteTokenValidationInteractor } from "./invite-token-validation.interactor";

import {
  decodeOnboardingIntent,
  encodeCreateCompanyOnboardingIntent,
  encodeInvitationOnboardingIntent,
  onboardingIntentSigningSecret,
} from "./onboarding-intent-codec";

export type OnboardingIntentError =
  | "invalidInviteLink"
  | "invalidOnboardingIntent"
  | "inviteLinkExpired"
  | "onboardingSessionExpired";

type IntentSource = "explicit" | "legacy";

export type OnboardingIntentState =
  | { status: "absent" }
  | { errorMessage: OnboardingIntentError; source: IntentSource; status: "invalid" }
  | { authUserId: string; intent: string; source: IntentSource; status: "valid"; type: "createCompany" }
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

export class OnboardingIntentService {
  private readonly signingSecret: string;

  constructor(
    private readonly inviteTokenValidationInteractor: InviteTokenValidationInteractor,
    betterAuthSecret: string,
  ) {
    const signingSecret = onboardingIntentSigningSecret(betterAuthSecret);
    if (!signingSecret) throw new Error("BETTER_AUTH_SECRET is required to issue onboarding intents.");
    this.signingSecret = signingSecret;
  }

  issueInvitation(token: string, inviteExpiresAt: Date, now = new Date()): string | null {
    return encodeInvitationOnboardingIntent(token, inviteExpiresAt, this.signingSecret, now);
  }

  issueCreateCompany(authUserId: string, now = new Date()): string {
    const intent = encodeCreateCompanyOnboardingIntent(authUserId, this.signingSecret, now);
    if (!intent) throw new Error("Could not issue company creation onboarding intent.");
    return intent;
  }

  async resolve(value?: unknown, legacyToken?: string): Promise<OnboardingIntentState> {
    if (value !== undefined) {
      if (typeof value !== "string" || value.length === 0)
        return { errorMessage: "invalidOnboardingIntent", source: "explicit", status: "invalid" };

      const decoded = decodeOnboardingIntent(value, this.signingSecret);
      if (decoded.status === "expired")
        return { errorMessage: "onboardingSessionExpired", source: "explicit", status: "invalid" };

      if (decoded.status === "invalid")
        return { errorMessage: "invalidOnboardingIntent", source: "explicit", status: "invalid" };

      if (decoded.payload.type === "invitation")
        return this.validateInvitation(decoded.payload.token, "explicit", value);

      return {
        authUserId: decoded.payload.authUserId,
        intent: value,
        source: "explicit",
        status: "valid",
        type: "createCompany",
      };
    }

    if (legacyToken) return this.validateInvitation(legacyToken, "legacy");
    return { status: "absent" };
  }

  private async validateInvitation(
    token: string,
    source: IntentSource,
    existingIntent?: string,
  ): Promise<OnboardingIntentState> {
    const result = await this.inviteTokenValidationInteractor.invoke({ token });
    if (!result.ok) return { errorMessage: "invalidInviteLink", source, status: "invalid" };
    if (!result.data.valid) return { errorMessage: result.data.errorMessage, source, status: "invalid" };

    const intent = existingIntent ?? this.issueInvitation(token, result.data.expiresAt);
    if (!intent) return { errorMessage: "inviteLinkExpired", source, status: "invalid" };

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
}
