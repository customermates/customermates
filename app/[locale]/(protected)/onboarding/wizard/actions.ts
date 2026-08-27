"use server";

import type { RegisterUserData } from "@/features/user/register/register-user.interactor";

import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getCompleteOnboardingWizardInteractor, getRegisterUserInteractor } from "@/core/di";
import { serializeResult } from "@/core/utils/action-result";

export async function registerProfileAction(data: RegisterUserData) {
  const result = await serializeResult(getRegisterUserInteractor().invoke(data));
  if (result.ok) {
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
