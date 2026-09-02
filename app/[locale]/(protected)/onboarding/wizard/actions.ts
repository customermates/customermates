"use server";

import type { RegisterUserData } from "@/features/user/register/register-user.interactor";

import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getCompleteOnboardingWizardInteractor, getRegisterUserInteractor } from "@/core/di";
import { serializeResult } from "@/core/utils/action-result";
import {
  clearRegisteredAdClicksFromCookie,
  readRegistrationAdAttribution,
} from "@/features/acquisition/ad-attribution.cookie";

export async function registerProfileAction(data: RegisterUserData) {
  const adAttribution = await readRegistrationAdAttribution();
  const result = await serializeResult(getRegisterUserInteractor().invoke(data, { adAttribution }));
  if (result.ok) {
    await clearRegisteredAdClicksFromCookie();
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
