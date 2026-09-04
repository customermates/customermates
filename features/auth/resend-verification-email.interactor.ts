import type { AuthService } from "./auth.service";
import type { OnboardingIntentService } from "@/features/company/onboarding-intent.service";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { pathWithOnboardingIntent } from "@/features/company/onboarding-intent-url";

@SystemInteractor
export class ResendVerificationEmailInteractor {
  constructor(
    private readonly authService: AuthService,
    private readonly onboardingIntentService: OnboardingIntentService,
  ) {}

  async invoke(onboardingIntentValue?: string): Promise<{ ok: boolean }> {
    const session = await this.authService.getSession();
    if (!session?.user?.email) return { ok: false };

    let callbackURL: string | undefined;
    if (onboardingIntentValue !== undefined) {
      const onboardingIntent = await this.onboardingIntentService.resolve(onboardingIntentValue);
      if (onboardingIntent.status === "valid") {
        const destination = onboardingIntent.type === "invitation" ? "/auth/invitation" : "/onboarding/wizard";
        callbackURL = pathWithOnboardingIntent(destination, onboardingIntent.intent);
      }
    }

    await this.authService.resendVerificationEmail(session.user.email, { callbackURL, keepSession: true });

    return { ok: true };
  }
}
