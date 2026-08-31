"use server";

import type { RegisterUserData } from "@/features/user/register/register-user.interactor";

import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getCompleteOnboardingWizardInteractor, getRegisterUserInteractor } from "@/core/di";
import { serializeResult } from "@/core/utils/action-result";
import {
  clearRegisteredGoogleAdsClickFromCookie,
  readRegistrationGoogleAdsAttribution,
} from "@/features/acquisition/google-ads-consent.cookie";

export async function registerProfileAction(data: RegisterUserData) {
  const googleAdsAttribution = await readRegistrationGoogleAdsAttribution();
  const result = await serializeResult(getRegisterUserInteractor().invoke(data, { googleAdsAttribution }));
  if (result.ok) {
    await clearRegisteredGoogleAdsClickFromCookie();
    const cookieStore = await cookies();
    cookieStore.delete("inviteToken");
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
