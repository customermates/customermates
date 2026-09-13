import type { Metadata } from "next";

import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";

import { SignInForm } from "./sign-in-form";

import { generateMetadataFromMeta } from "@/core/fumadocs/metadata";
import { requireUnauthenticated } from "@/features/auth/next/require";
import { resolveRequestAccountState } from "@/features/auth/next/resolve-account-state";
import { enabledSocialProviders } from "@/core/auth/better-auth";
import { CenteredCardPage } from "@/components/shared/centered-card-page";
import {
  ONBOARDING_INTENT_QUERY_PARAM,
  onboardingIntentFromPath,
  pathWithOnboardingIntent,
} from "@/features/company/onboarding-intent-url";
import { resolveOnboardingIntent } from "@/features/company/next/onboarding-intent";
import { buildLocalePath } from "@/i18n/locale-registry";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return generateMetadataFromMeta({ locale, route: "/auth/signin" });
}

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function SignInPage({ searchParams }: Props) {
  const params = await searchParams;
  const callbackURLValue = params.callbackURL;
  const callbackURL = typeof callbackURLValue === "string" ? callbackURLValue : undefined;
  const callbackIntent =
    callbackURLValue === undefined
      ? { status: "absent" as const }
      : typeof callbackURLValue === "string"
        ? onboardingIntentFromPath(callbackURLValue)
        : { status: "invalid" as const };
  const intentValue =
    params[ONBOARDING_INTENT_QUERY_PARAM] !== undefined
      ? params[ONBOARDING_INTENT_QUERY_PARAM]
      : callbackIntent.status === "valid"
        ? callbackIntent.intent
        : callbackIntent.status === "invalid"
          ? []
          : undefined;
  const onboardingIntent = await resolveOnboardingIntent(intentValue);
  if (onboardingIntent.status === "invalid" && onboardingIntent.source === "explicit")
    redirect(buildLocalePath(await getLocale(), `/auth/error?type=${onboardingIntent.errorMessage}`));
  const activeIntent = onboardingIntent.status === "valid" ? onboardingIntent : null;
  const invitation =
    onboardingIntent.status === "valid" && onboardingIntent.type === "invitation" ? onboardingIntent : null;
  if (activeIntent) {
    const resolution = await resolveRequestAccountState();
    if (resolution.sessionUser) {
      if (activeIntent.type === "createCompany" && activeIntent.authUserId !== resolution.sessionUser.id)
        redirect(buildLocalePath(await getLocale(), "/auth/error?type=invalidOnboardingIntent"));

      const destination =
        activeIntent.type === "invitation"
          ? pathWithOnboardingIntent("/auth/invitation", activeIntent.intent)
          : pathWithOnboardingIntent("/onboarding/wizard", activeIntent.intent);
      redirect(buildLocalePath(await getLocale(), destination));
    }
  }

  await requireUnauthenticated();

  return (
    <CenteredCardPage>
      <SignInForm
        callbackURL={
          activeIntent
            ? pathWithOnboardingIntent(
                activeIntent.type === "invitation" ? "/auth/invitation" : "/onboarding/wizard",
                activeIntent.intent,
              )
            : callbackURL
        }
        inviterName={invitation?.inviterName}
        onboardingIntent={activeIntent?.intent}
        socialProviders={enabledSocialProviders}
      />
    </CenteredCardPage>
  );
}
