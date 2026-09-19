import type { AuthService } from "./auth.service";
import type { OnboardingIntentService } from "@/features/company/onboarding-intent.service";

import * as Sentry from "@sentry/nextjs";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { pathWithOnboardingIntent } from "@/features/company/onboarding-intent-url";

export type ResendVerificationEmailData = {
  onboardingIntent?: string;
};

@SystemInteractor
export class ResendVerificationEmailInteractor {
  constructor(
    private readonly authService: AuthService,
    private readonly onboardingIntentService: OnboardingIntentService,
  ) {}

  async invoke(data: ResendVerificationEmailData = {}): Promise<{ ok: boolean }> {
    const session = await this.authService.getSession();
    const email = session?.user?.email;
    if (!email) return { ok: false };

    const callbackURL = await this.resolveCallbackUrl(data.onboardingIntent);

    try {
      await this.authService.resendVerificationEmail(email, { callbackURL, keepSession: true });
    } catch (error) {
      Sentry.captureException(error);
      return { ok: false };
    }

    return { ok: true };
  }

  private async resolveCallbackUrl(onboardingIntentValue?: string): Promise<string | undefined> {
    if (onboardingIntentValue === undefined) return undefined;

    const onboardingIntent = await this.onboardingIntentService.resolve(onboardingIntentValue);
    if (onboardingIntent.status !== "valid") return undefined;

    const destination = onboardingIntent.type === "invitation" ? "/auth/invitation" : "/onboarding/wizard";
    return pathWithOnboardingIntent(destination, onboardingIntent.intent);
  }
}
