import type { AuthService } from "./auth.service";
import type { OnboardingIntentService } from "@/features/company/onboarding-intent.service";

import * as Sentry from "@sentry/nextjs";
import { z } from "zod";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { pathWithOnboardingIntent } from "@/features/company/onboarding-intent-url";

const requestedEmailSchema = z.email();

export type ResendVerificationEmailData = {
  onboardingIntent?: string;
  email?: string;
};

@SystemInteractor
export class ResendVerificationEmailInteractor {
  constructor(
    private readonly authService: AuthService,
    private readonly onboardingIntentService: OnboardingIntentService,
  ) {}

  async invoke(data: ResendVerificationEmailData = {}): Promise<{ ok: boolean }> {
    const session = await this.authService.getSession();
    const sessionEmail = session?.user?.email;
    const requestedEmail = sessionEmail ? undefined : this.parseRequestedEmail(data.email);
    const email = sessionEmail ?? requestedEmail;
    if (!email) return { ok: false };

    const callbackURL = await this.resolveCallbackUrl(data.onboardingIntent);

    if (sessionEmail) {
      await this.authService.resendVerificationEmail(email, { callbackURL, keepSession: true });
      return { ok: true };
    }

    try {
      return { ok: await this.authService.sendVerificationEmailForAddress(email, callbackURL) };
    } catch (error) {
      Sentry.captureException(error);
      return { ok: false };
    }
  }

  private async resolveCallbackUrl(onboardingIntentValue?: string): Promise<string | undefined> {
    if (onboardingIntentValue === undefined) return undefined;

    const onboardingIntent = await this.onboardingIntentService.resolve(onboardingIntentValue);
    if (onboardingIntent.status !== "valid") return undefined;

    const destination = onboardingIntent.type === "invitation" ? "/auth/invitation" : "/onboarding/wizard";
    return pathWithOnboardingIntent(destination, onboardingIntent.intent);
  }

  private parseRequestedEmail(value: string | undefined): string | undefined {
    const parsed = requestedEmailSchema.safeParse(value?.trim().toLowerCase());
    return parsed.success ? parsed.data : undefined;
  }
}
