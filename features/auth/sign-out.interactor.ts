import type { AuthService } from "./auth.service";
import type { Redirect } from "./auth-outcome";
import type { InviteTokenCookieRepo } from "@/features/company/invite-token-cookie.repo";
import type { OnboardingIntentService } from "@/features/company/onboarding-intent.service";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { redirectTo } from "./auth-outcome";
import { pathWithOnboardingIntent } from "@/features/company/onboarding-intent-url";

@SystemInteractor
export class SignOutInteractor {
  constructor(
    private readonly authService: AuthService,
    private readonly onboardingIntentService: OnboardingIntentService,
    private readonly inviteTokenCookieRepo: InviteTokenCookieRepo,
  ) {}

  async invoke(data: { invitationIntent?: string } = {}): Promise<Redirect> {
    const invitation =
      data.invitationIntent === undefined ? null : await this.onboardingIntentService.resolve(data.invitationIntent);
    await this.inviteTokenCookieRepo.clear();
    await this.authService.signOut();

    if (!invitation) return redirectTo("/");
    if (invitation.status !== "valid" || invitation.type !== "invitation") {
      const errorMessage = invitation.status === "invalid" ? invitation.errorMessage : "invalidOnboardingIntent";
      return redirectTo(`/auth/error?type=${errorMessage}`);
    }

    return redirectTo(pathWithOnboardingIntent("/auth/signup", invitation.intent));
  }
}
