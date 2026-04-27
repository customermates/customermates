"use server";

import type { RegisterUserData } from "@/features/user/register/register-user.interactor";
import type { CompleteOnboardingWizardData } from "@/features/onboarding-wizard/complete-onboarding-wizard.interactor";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Status } from "@/generated/prisma";

import { getCompleteOnboardingWizardInteractor, getRegisterUserInteractor, getUserService } from "@/core/di";
import { serializeResult } from "@/core/utils/action-result";

export async function registerProfileAction(data: RegisterUserData) {
  const result = await serializeResult(getRegisterUserInteractor().invoke(data));
  if (result.ok) {
    const cookieStore = await cookies();
    cookieStore.delete("inviteToken");
    const user = await getUserService().getUser();
    if (user?.status === Status.pendingAuthorization) redirect("/auth/pending");
    redirect("/onboarding/wizard");
  }
  return result;
}

export async function completeOnboardingWizardAction(data: CompleteOnboardingWizardData) {
  const result = await serializeResult(getCompleteOnboardingWizardInteractor().invoke(data));
  if (result.ok) redirect("/");
  return result;
}
