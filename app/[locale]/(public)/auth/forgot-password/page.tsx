import type { Metadata } from "next";

import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";

import { ForgotPasswordForm } from "./forgot-password-form";

import { generateMetadataFromMeta } from "@/core/fumadocs/metadata";
import { requireUnauthenticated } from "@/features/auth/next/require";
import { resolveRequestAccountState } from "@/features/auth/next/resolve-account-state";
import { CenteredCardPage } from "@/components/shared/centered-card-page";
import { ONBOARDING_INTENT_QUERY_PARAM, pathWithOnboardingIntent } from "@/features/company/onboarding-intent-url";
import { resolveOnboardingIntent } from "@/features/company/next/onboarding-intent";
import { buildLocalePath } from "@/i18n/locale-registry";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return generateMetadataFromMeta({ locale, route: "/auth/forgot-password" });
}

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ForgotPasswordPage({ searchParams }: Props) {
  const params = await searchParams;
  const onboardingIntent = await resolveOnboardingIntent(params[ONBOARDING_INTENT_QUERY_PARAM]);
  const activeIntent = onboardingIntent.status === "valid" ? onboardingIntent : null;
  const invitation =
    onboardingIntent.status === "valid" && onboardingIntent.type === "invitation" ? onboardingIntent : null;
  if (activeIntent) {
    const resolution = await resolveRequestAccountState();
    if (resolution.sessionUser) {
      if (activeIntent.type === "createCompany" && activeIntent.authUserId !== resolution.sessionUser.id)
        redirect(buildLocalePath(await getLocale(), "/auth/error?type=invalidOnboardingIntent"));

      redirect(
        buildLocalePath(
          await getLocale(),
          pathWithOnboardingIntent(
            activeIntent.type === "invitation" ? "/auth/invitation" : "/onboarding/wizard",
            activeIntent.intent,
          ),
        ),
      );
    }
  }

  await requireUnauthenticated();

  return (
    <CenteredCardPage>
      <ForgotPasswordForm inviterName={invitation?.inviterName} onboardingIntent={activeIntent?.intent} />
    </CenteredCardPage>
  );
}
