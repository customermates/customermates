"use server";

import { redirect } from "next/navigation";
import { appRedirectHref } from "@/features/auth/next/app-redirect";

import { getChooseWorkspaceOnboardingInteractor } from "@/core/di";

export async function chooseWorkspaceAction(_state: null, formData: FormData): Promise<null> {
  const result = await getChooseWorkspaceOnboardingInteractor().invoke({ choice: formData.get("workspaceChoice") });
  if (result) redirect(await appRedirectHref(result.redirect));

  return null;
}
