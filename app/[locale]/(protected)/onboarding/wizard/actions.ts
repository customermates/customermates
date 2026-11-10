"use server";

import type { RegisterOnboardingProfileData } from "@/features/user/register/register-onboarding-profile.interactor";
import type { SaveOnboardingWizardProgressData } from "@/features/onboarding-wizard/save-onboarding-wizard-progress.interactor";
import type { SelectOnboardingJobData } from "@/features/onboarding-funnel/select-onboarding-job.interactor";
import type { ApplyOnboardingPlaybookData } from "@/features/onboarding-funnel/apply-onboarding-playbook.interactor";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { appRedirectHref } from "@/features/auth/next/app-redirect";
import { getLocale } from "next-intl/server";

import {
  getApplyOnboardingPlaybookInteractor,
  getCompleteOnboardingSetupStepInteractor,
  getCompleteOnboardingWizardInteractor,
  getRegisterOnboardingProfileInteractor,
  getSaveOnboardingWizardProgressInteractor,
  getSelectOnboardingJobInteractor,
} from "@/core/di";
import { serializeResult, serializeTypedResult, settleActionResult } from "@/core/utils/action-result";
import { isRedirect } from "@/features/auth/auth-outcome";
import {
  clearRegisteredAdClicksFromCookie,
  readRegistrationAdAttribution,
} from "@/features/acquisition/next/ad-attribution-cookie";
import { forgetSignupJourney, readRegistrationSignupSource } from "@/features/acquisition/next/signup-journey-cookie";
import { appLocaleOrDefault, buildLocalePath } from "@/i18n/locale-registry";

async function settleInLocale<T>(outcome: Parameters<typeof settleActionResult<T>>[0]) {
  const settled = await settleActionResult(outcome);
  if (isRedirect(settled)) redirect(await appRedirectHref(settled.redirect));
  return settled;
}

export async function registerProfileAction(data: RegisterOnboardingProfileData) {
  const adAttribution = await readRegistrationAdAttribution();
  const signupSource = await readRegistrationSignupSource();
  const registrationResult = await getRegisterOnboardingProfileInteractor().invoke(data, {
    adAttribution,
    signupSource,
  });
  if (isRedirect(registrationResult)) redirect(await appRedirectHref(registrationResult.redirect));
  const result = await serializeResult(registrationResult);
  if (result.ok) {
    await clearRegisteredAdClicksFromCookie();
    await forgetSignupJourney();
    refresh();
    const chosen =
      data.displayLanguage && data.displayLanguage !== "system" ? appLocaleOrDefault(data.displayLanguage) : null;
    redirect(buildLocalePath(chosen ?? (await getLocale()), result.data.redirectTo));
  }
  return result;
}

export async function completeOnboardingWizardAction() {
  const result = await serializeTypedResult(await settleInLocale(getCompleteOnboardingWizardInteractor().invoke()));
  if (result.ok) refresh();
  return result;
}

export async function saveOnboardingWizardProgressAction(data: SaveOnboardingWizardProgressData) {
  return serializeTypedResult(await settleInLocale(getSaveOnboardingWizardProgressInteractor().invoke(data)));
}

export async function completeOnboardingSetupStepAction() {
  return serializeTypedResult(await settleInLocale(getCompleteOnboardingSetupStepInteractor().invoke()));
}

export async function selectOnboardingJobAction(data: SelectOnboardingJobData) {
  return serializeTypedResult(await settleInLocale(getSelectOnboardingJobInteractor().invoke(data)));
}

export async function applyOnboardingPlaybookAction(data: Pick<ApplyOnboardingPlaybookData, "playbook">) {
  const locale = appLocaleOrDefault(await getLocale());
  const result = await serializeTypedResult(
    await settleInLocale(getApplyOnboardingPlaybookInteractor().invoke({ playbook: data.playbook, locale })),
  );
  if (result.ok) refresh();
  return result;
}
