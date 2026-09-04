import { VerifyEmailCard } from "./verify-email-card";

import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";

import { CenteredCardPage } from "@/components/shared/centered-card-page";
import { requireAccountState } from "@/features/auth/next/require";
import { NOINDEX_METADATA } from "@/core/seo/noindex-metadata";
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

export default async function VerifyEmailPage({ searchParams }: Props) {
  const params = await searchParams;
  const onboardingIntent = await resolveOnboardingIntent(params[ONBOARDING_INTENT_QUERY_PARAM]);
  const locale = await getLocale();

  const activeIntent = onboardingIntent.status === "valid" ? onboardingIntent : null;
  const resolution = await requireAccountState(
    ["overdueVerification", "unregistered"],
    "/",
    activeIntent ? onboardingIntentAuthRedirects(activeIntent.intent) : undefined,
  );
  const invitation =
    onboardingIntent.status === "valid" && onboardingIntent.type === "invitation" ? onboardingIntent : null;
  if (activeIntent?.type === "createCompany" && activeIntent.authUserId !== resolution.sessionUser?.id)
    redirect(buildLocalePath(locale, "/auth/error?type=invalidOnboardingIntent"));
  if (resolution.state === "unregistered") {
    const destination = activeIntent
      ? pathWithOnboardingIntent(
          activeIntent.type === "invitation" ? "/auth/invitation" : "/onboarding/wizard",
          activeIntent.intent,
        )
      : "/onboarding";
    redirect(buildLocalePath(locale, destination));
  }

  return (
    <CenteredCardPage>
      <VerifyEmailCard
        email={resolution.sessionUser?.email}
        inviterName={invitation?.inviterName}
        onboardingIntent={activeIntent?.intent}
      />
    </CenteredCardPage>
  );
}
