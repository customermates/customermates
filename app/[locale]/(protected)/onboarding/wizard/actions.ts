"use server";

import type { RegisterUserData, RegistrationTarget } from "@/features/user/register/register-user.interactor";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";

import { getAuthService, getCompleteOnboardingWizardInteractor, getRegisterUserInteractor } from "@/core/di";
import { serializeResult } from "@/core/utils/action-result";
import { isRedirect } from "@/features/auth/auth-outcome";
import {
  clearRegisteredAdClicksFromCookie,
  readRegistrationAdAttribution,
} from "@/features/acquisition/next/ad-attribution-cookie";
import { resolveOnboardingIntent } from "@/features/company/next/onboarding-intent";
import { clearInviteTokenCookie } from "@/features/company/next/invite-token-cookie";
import { pathWithOnboardingIntent } from "@/features/company/onboarding-intent-url";
import { buildLocalePath } from "@/i18n/locale-registry";

export async function registerProfileAction(data: RegisterUserData, onboardingIntentValue?: string) {
  const adAttribution = await readRegistrationAdAttribution();
  const onboardingIntent = await resolveOnboardingIntent(onboardingIntentValue);
  if (onboardingIntent.status === "invalid") {
    await clearInviteTokenCookie();
    if (onboardingIntent.source === "explicit")
      redirect(buildLocalePath(await getLocale(), `/auth/error?type=${onboardingIntent.errorMessage}`));
  }

  let target: RegistrationTarget = { type: "legacyAuthBinding" };
  if (onboardingIntent.status === "valid" && onboardingIntent.type === "invitation")
    target = { type: "invitation", companyId: onboardingIntent.companyId } as const;
  if (onboardingIntent.status === "valid" && onboardingIntent.type === "createCompany") {
    const session = await getAuthService().getSession();
    if (!session)
      redirect(buildLocalePath(await getLocale(), pathWithOnboardingIntent("/auth/signin", onboardingIntent.intent)));

    if (onboardingIntent.authUserId !== session?.user.id) {
      await clearInviteTokenCookie();
      redirect(buildLocalePath(await getLocale(), "/auth/error?type=invalidOnboardingIntent"));
    }
    target = { type: "createCompany" } as const;
  }
  const registrationResult = await getRegisterUserInteractor().invoke(data, {
    adAttribution,
    target,
  });
  if (isRedirect(registrationResult) && onboardingIntent.status === "valid") {
    if (registrationResult.redirect === "/auth/signin")
      redirect(buildLocalePath(await getLocale(), pathWithOnboardingIntent("/auth/signin", onboardingIntent.intent)));

    if (registrationResult.redirect === "/auth/signup" && onboardingIntent.type === "invitation")
      redirect(buildLocalePath(await getLocale(), pathWithOnboardingIntent("/auth/signup", onboardingIntent.intent)));
  }
  const result = await serializeResult(registrationResult);
  if (result.ok) {
    await clearRegisteredAdClicksFromCookie();
    await clearInviteTokenCookie();
    refresh();
    redirect(result.data.redirectTo);
  }
  return result;
}

export async function completeOnboardingWizardAction() {
  const result = await serializeResult(getCompleteOnboardingWizardInteractor().invoke());
  if (result.ok) refresh();
  return result;
}
