"use server";

import type { RegisterUserData } from "@/features/user/register/register-user.interactor";

import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Status } from "@/generated/prisma";

import { getCompleteOnboardingWizardInteractor, getRegisterUserInteractor, getUserService } from "@/core/di";
import { serializeResult } from "@/core/utils/action-result";
import { requireAccountState } from "@/features/auth/next/require";

export async function registerProfileAction(data: RegisterUserData) {
  const resolution = await requireAccountState("unregistered");
  const sessionEmail = resolution.sessionUser?.email;
  if (!sessionEmail) redirect("/auth/signin");

  const result = await serializeResult(getRegisterUserInteractor().invoke({ ...data, email: sessionEmail }));
  if (result.ok) {
    const cookieStore = await cookies();
    cookieStore.delete("inviteToken");
    const user = await getUserService().getUser();
    refresh();
    if (user?.status === Status.pendingAuthorization) redirect("/auth/pending");
    redirect("/onboarding/wizard");
  }
  return result;
}

export async function completeOnboardingWizardAction() {
  await requireAccountState("onboarding");
  const result = await serializeResult(getCompleteOnboardingWizardInteractor().invoke());
  if (result.ok) {
    refresh();
    redirect("/");
  }
  return result;
}
