"use server";

import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";

import { getChooseWorkspaceOnboardingInteractor } from "@/core/di";
import { buildLocalePath } from "@/i18n/locale-registry";

export async function chooseWorkspaceAction(_state: null, formData: FormData): Promise<null> {
  const result = await getChooseWorkspaceOnboardingInteractor().invoke({ choice: formData.get("workspaceChoice") });
  if (result) redirect(buildLocalePath(await getLocale(), result.redirect));

  return null;
}
