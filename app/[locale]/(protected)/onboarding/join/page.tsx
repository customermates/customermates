import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";

import { JoinWorkspaceCard } from "./join-workspace-card";

import { CenteredCardPage } from "@/components/shared/centered-card-page";
import { NOINDEX_METADATA } from "@/core/seo/noindex-metadata";
import { requireAccountState } from "@/features/auth/next/require";
import {
  ONBOARDING_INTENT_QUERY_PARAM,
  onboardingIntentAuthRedirects,
  pathWithOnboardingIntent,
} from "@/features/company/onboarding-intent-url";
import { resolveOnboardingIntent } from "@/features/company/next/onboarding-intent";
import { buildLocalePath } from "@/i18n/locale-registry";

export const metadata = NOINDEX_METADATA;

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function JoinWorkspacePage({ searchParams }: Props) {
  const params = await searchParams;
  const invitation = await resolveOnboardingIntent(params[ONBOARDING_INTENT_QUERY_PARAM]);
  const locale = await getLocale();
  if (invitation.status === "invalid" && invitation.source === "explicit")
    redirect(buildLocalePath(locale, `/auth/error?type=${invitation.errorMessage}`));
  if (invitation.status === "valid" && invitation.type !== "invitation")
    redirect(buildLocalePath(locale, "/auth/error?type=invalidOnboardingIntent"));
  const activeIntent = invitation.status === "valid" ? invitation : null;
  const resolution = await requireAccountState(
    "unregistered",
    "/",
    activeIntent ? onboardingIntentAuthRedirects(activeIntent.intent) : undefined,
  );
  const sessionUser = resolution.sessionUser;
  if (!sessionUser) redirect(buildLocalePath(locale, "/auth/signin"));

  if (invitation.status === "valid")
    redirect(buildLocalePath(locale, pathWithOnboardingIntent("/onboarding/wizard", invitation.intent)));
  if (sessionUser.companyId) redirect(buildLocalePath(locale, "/onboarding/wizard"));

  return (
    <CenteredCardPage className="animate-page-result-in motion-reduce:animate-none">
      <JoinWorkspaceCard email={sessionUser.email} />
    </CenteredCardPage>
  );
}
