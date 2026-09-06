import type { AuthService } from "@/features/auth/auth.service";
import type { Redirect } from "@/features/auth/auth-outcome";
import type { InviteTokenValidationInteractor } from "./invite-token-validation.interactor";
import type { OnboardingIntentService } from "./onboarding-intent.service";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { redirectTo } from "@/features/auth/auth-outcome";
import { pathWithOnboardingIntent } from "./onboarding-intent-url";

@SystemInteractor
export class OpenInvitationInteractor {
  constructor(
    private readonly inviteTokenValidationInteractor: InviteTokenValidationInteractor,
    private readonly authService: AuthService,
    private readonly onboardingIntentService: OnboardingIntentService,
  ) {}

  async invoke(data: { token: string }): Promise<Redirect> {
    const result = await this.inviteTokenValidationInteractor.invoke(data);
    if (!result.ok) return redirectTo("/auth/error?type=invalidInviteLink");
    if (!result.data.valid) return redirectTo(`/auth/error?type=${result.data.errorMessage}`);

    const session = await this.authService.getSession();
    const intent = this.onboardingIntentService.issueInvitation(data.token, result.data.expiresAt);
    if (!intent) return redirectTo("/auth/error?type=inviteLinkExpired");

    return redirectTo(pathWithOnboardingIntent(session ? "/auth/invitation" : "/auth/signup", intent));
  }
}
