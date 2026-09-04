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

  async invoke(data: { onboardingIntent?: string } = {}): Promise<Redirect> {
    const onboardingIntent =
      data.onboardingIntent === undefined ? null : await this.onboardingIntentService.resolve(data.onboardingIntent);
    await this.inviteTokenCookieRepo.clear();
    await this.authService.signOut();

    if (!onboardingIntent) return redirectTo("/");
    if (onboardingIntent.status === "invalid") return redirectTo(`/auth/error?type=${onboardingIntent.errorMessage}`);
    if (onboardingIntent.status === "absent") return redirectTo("/");
    if (onboardingIntent.type !== "invitation") return redirectTo("/");

    return redirectTo(pathWithOnboardingIntent("/auth/signup", onboardingIntent.intent));
  }
}
