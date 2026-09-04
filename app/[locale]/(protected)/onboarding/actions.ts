"use server";

import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";

import { requireAccountState } from "@/features/auth/next/require";
import { pathWithOnboardingIntent } from "@/features/company/onboarding-intent-url";
import { issueCreateCompanyOnboardingIntent } from "@/features/company/next/onboarding-intent";
import { clearInviteTokenCookie } from "@/features/company/next/invite-token-cookie";
import { buildLocalePath } from "@/i18n/locale-registry";

export async function chooseCreateWorkspaceAction(): Promise<void> {
  const { sessionUser } = await requireAccountState("unregistered");
  const locale = await getLocale();
  if (!sessionUser) redirect(buildLocalePath(locale, "/auth/signin"));

  await clearInviteTokenCookie();
  const onboardingIntent = issueCreateCompanyOnboardingIntent(sessionUser.id);
  redirect(buildLocalePath(locale, pathWithOnboardingIntent("/onboarding/wizard", onboardingIntent)));
}

export async function chooseJoinWorkspaceAction(): Promise<void> {
  await requireAccountState("unregistered");
  await clearInviteTokenCookie();
  redirect(buildLocalePath(await getLocale(), "/onboarding/join"));
}

export async function chooseWorkspaceAction(_state: null, formData: FormData): Promise<null> {
  const choice = formData.get("workspaceChoice");

  if (choice === "create") await chooseCreateWorkspaceAction();
  if (choice === "join") await chooseJoinWorkspaceAction();

  return null;
}
