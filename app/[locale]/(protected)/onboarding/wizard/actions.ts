"use server";

import type { RegisterOnboardingProfileData } from "@/features/user/register/register-onboarding-profile.interactor";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";

import { getCompleteOnboardingWizardInteractor, getRegisterOnboardingProfileInteractor } from "@/core/di";
import { serializeResult } from "@/core/utils/action-result";
import { isRedirect } from "@/features/auth/auth-outcome";
import {
  clearRegisteredAdClicksFromCookie,
  readRegistrationAdAttribution,
} from "@/features/acquisition/next/ad-attribution-cookie";
import { buildLocalePath } from "@/i18n/locale-registry";

export async function registerProfileAction(data: RegisterOnboardingProfileData) {
  const adAttribution = await readRegistrationAdAttribution();
  const registrationResult = await getRegisterOnboardingProfileInteractor().invoke(data, { adAttribution });
  if (isRedirect(registrationResult)) redirect(buildLocalePath(await getLocale(), registrationResult.redirect));
  const result = await serializeResult(registrationResult);
  if (result.ok) {
    await clearRegisteredAdClicksFromCookie();
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
