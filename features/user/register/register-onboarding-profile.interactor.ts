import type { AuthService } from "@/features/auth/auth.service";
import type { Redirect } from "@/features/auth/auth-outcome";
import type { RegistrationAdAttribution } from "@/features/acquisition/ad-attribution.schema";
import type { InviteTokenCookieRepo } from "@/features/company/invite-token-cookie.repo";
import type { OnboardingIntentService } from "@/features/company/onboarding-intent.service";
import type { Validated } from "@/core/validation/validation.utils";

import { isRedirect, redirectTo } from "@/features/auth/auth-outcome";
import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { pathWithOnboardingIntent } from "@/features/company/onboarding-intent-url";
import {
  type RegisterUserInteractor,
  type RegisterUserData,
  type RegisterUserResult,
  type RegistrationTarget,
} from "./register-user.interactor";

export type RegisterOnboardingProfileData = RegisterUserData & { onboardingIntent?: string };

type RegistrationContext = { adAttribution?: RegistrationAdAttribution[] };

@SystemInteractor
export class RegisterOnboardingProfileInteractor {
  constructor(
    private readonly authService: AuthService,
    private readonly onboardingIntentService: OnboardingIntentService,
    private readonly inviteTokenCookieRepo: InviteTokenCookieRepo,
    private readonly registerUserInteractor: RegisterUserInteractor,
  ) {}

  async invoke(
    data: RegisterOnboardingProfileData,
    context: RegistrationContext = {},
  ): Promise<Awaited<Validated<RegisterUserResult>> | Redirect> {
    const legacyToken = data.onboardingIntent === undefined ? await this.inviteTokenCookieRepo.read() : undefined;
    const onboardingIntent = await this.onboardingIntentService.resolve(data.onboardingIntent, legacyToken);
    if (onboardingIntent.status === "invalid") {
      await this.inviteTokenCookieRepo.clear();
      if (onboardingIntent.source === "explicit")
        return redirectTo(`/auth/error?type=${onboardingIntent.errorMessage}`);
    }

    let target: RegistrationTarget = { type: "existingAuthUserCompanyBinding" };
    if (onboardingIntent.status === "valid" && onboardingIntent.type === "invitation")
      target = { type: "invitation", companyId: onboardingIntent.companyId };
    if (onboardingIntent.status === "valid" && onboardingIntent.type === "createCompany") {
      const session = await this.authService.getSession();
      if (!session) return redirectTo(pathWithOnboardingIntent("/auth/signin", onboardingIntent.intent));

      if (onboardingIntent.authUserId !== session.user.id) {
        await this.inviteTokenCookieRepo.clear();
        return redirectTo("/auth/error?type=invalidOnboardingIntent");
      }
      target = { type: "createCompany" };
    }

    const registrationData = { ...data };
    delete registrationData.onboardingIntent;
    const result = await this.registerUserInteractor.invoke(registrationData, {
      adAttribution: context.adAttribution,
      target,
    });

    if (isRedirect(result) && onboardingIntent.status === "valid") {
      if (result.redirect === "/auth/signin" || result.redirect === "/auth/verify-email")
        return redirectTo(pathWithOnboardingIntent(result.redirect, onboardingIntent.intent));

      if (result.redirect === "/auth/signup" && onboardingIntent.type === "invitation")
        return redirectTo(pathWithOnboardingIntent("/auth/signup", onboardingIntent.intent));
    }

    if (!isRedirect(result) && result.ok) await this.inviteTokenCookieRepo.clear();
    return result;
  }
}
