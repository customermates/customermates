import type { Metadata } from "next";

import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";

import { SignUpForm } from "./sign-up-form";

import { generateMetadataFromMeta } from "@/core/fumadocs/metadata";
import { requireUnauthenticated } from "@/features/auth/next/require";
import { resolveRequestAccountState } from "@/features/auth/next/resolve-account-state";
import { enabledSocialProviders } from "@/core/auth/better-auth";
import { CenteredCardPage } from "@/components/shared/centered-card-page";
import { ONBOARDING_INTENT_QUERY_PARAM, pathWithOnboardingIntent } from "@/features/company/onboarding-intent-url";
import { resolveOnboardingIntent } from "@/features/company/next/onboarding-intent";
import { buildLocalePath } from "@/i18n/locale-registry";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return generateMetadataFromMeta({ locale, route: "/auth/signup" });
}

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function SignUpPage({ searchParams }: Props) {
  const params = await searchParams;
  const onboardingIntent = await resolveOnboardingIntent(params[ONBOARDING_INTENT_QUERY_PARAM]);
  if (onboardingIntent.status === "invalid" && onboardingIntent.source === "explicit")
    redirect(buildLocalePath(await getLocale(), `/auth/error?type=${onboardingIntent.errorMessage}`));
  if (onboardingIntent.status === "valid" && onboardingIntent.type !== "invitation")
    redirect(buildLocalePath(await getLocale(), "/auth/error?type=invalidOnboardingIntent"));
  const invitation =
    onboardingIntent.status === "valid" && onboardingIntent.type === "invitation" ? onboardingIntent : null;
  if (invitation && (await resolveRequestAccountState()).sessionUser)
    redirect(buildLocalePath(await getLocale(), pathWithOnboardingIntent("/auth/invitation", invitation.intent)));

  await requireUnauthenticated();

  return (
    <CenteredCardPage>
      <SignUpForm
        invitationIntent={invitation?.intent}
        inviterName={invitation?.inviterName}
        socialProviders={enabledSocialProviders}
      />
    </CenteredCardPage>
  );
}
