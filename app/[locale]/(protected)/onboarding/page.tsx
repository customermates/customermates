import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";

import { OnboardingChoiceCard } from "./onboarding-choice-card";

import { CenteredCardPage } from "@/components/shared/centered-card-page";
import { CLOUD_TRIAL } from "@/core/commercial/plan-catalog";
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

export default async function OnboardingPage({ searchParams }: Props) {
  const params = await searchParams;
  const onboardingIntent = await resolveOnboardingIntent(params[ONBOARDING_INTENT_QUERY_PARAM]);
  const locale = await getLocale();
  if (onboardingIntent.status === "invalid" && onboardingIntent.source === "explicit")
    redirect(buildLocalePath(locale, `/auth/error?type=${onboardingIntent.errorMessage}`));
  const activeIntent = onboardingIntent.status === "valid" ? onboardingIntent : null;
  const resolution = await requireAccountState(
    "unregistered",
    "/",
    activeIntent ? onboardingIntentAuthRedirects(activeIntent.intent) : undefined,
  );
  const sessionUser = resolution.sessionUser;
  if (!sessionUser) redirect(buildLocalePath(locale, "/auth/signin"));

  if (activeIntent?.type === "createCompany" && activeIntent.authUserId !== sessionUser.id)
    redirect(buildLocalePath(locale, "/auth/error?type=invalidOnboardingIntent"));
  if (activeIntent)
    redirect(buildLocalePath(locale, pathWithOnboardingIntent("/onboarding/wizard", activeIntent.intent)));
  if (sessionUser.companyId) redirect(buildLocalePath(locale, "/onboarding/wizard"));

  return (
    <CenteredCardPage className="animate-page-result-in motion-reduce:animate-none">
      <OnboardingChoiceCard email={sessionUser.email} trialDays={CLOUD_TRIAL.days} />
    </CenteredCardPage>
  );
}
