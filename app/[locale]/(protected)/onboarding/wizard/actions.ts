"use server";

import type { RegisterUserData } from "@/features/user/register/register-user.interactor";
import type { SeedOnboardingData } from "@/features/onboarding-wizard/seed-onboarding-data.interactor";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Status } from "@/generated/prisma";

import {
  getCompleteOnboardingWizardInteractor,
  getRegisterUserInteractor,
  getSeedOnboardingDataInteractor,
  getUserService,
} from "@/core/di";
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

export async function seedOnboardingDataAction(data: SeedOnboardingData) {
  return serializeResult(getSeedOnboardingDataInteractor().invoke(data));
}

export async function completeOnboardingWizardAction() {
  const result = await serializeResult(getCompleteOnboardingWizardInteractor().invoke());
  if (result.ok) redirect("/");
  return result;
}
