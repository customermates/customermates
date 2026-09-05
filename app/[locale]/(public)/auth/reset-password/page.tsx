import type { Metadata } from "next";

import { redirect } from "next/navigation";

import { ResetPasswordForm } from "./reset-password-form";

import { generateMetadataFromMeta } from "@/core/fumadocs/metadata";
import { requireUnauthenticated } from "@/features/auth/next/require";
import { CenteredCardPage } from "@/components/shared/centered-card-page";
import { ONBOARDING_INTENT_QUERY_PARAM, pathWithOnboardingIntent } from "@/features/company/onboarding-intent-url";
import { resolveOnboardingIntent } from "@/features/company/next/onboarding-intent";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return generateMetadataFromMeta({ locale, route: "/auth/reset-password" });
}

export default async function ResetPasswordPage({ searchParams }: Props) {
  const params = await searchParams;
  const onboardingIntent = await resolveOnboardingIntent(params[ONBOARDING_INTENT_QUERY_PARAM]);
  const activeIntent = onboardingIntent.status === "valid" ? onboardingIntent : null;
  const invitation =
    onboardingIntent.status === "valid" && onboardingIntent.type === "invitation" ? onboardingIntent : null;

  await requireUnauthenticated();

  const error = params.error;
  if (error === "INVALID_TOKEN") {
    redirect(
      activeIntent
        ? pathWithOnboardingIntent("/auth/forgot-password?info=RESET_LINK_INVALID", activeIntent.intent)
        : "/auth/forgot-password?info=RESET_LINK_INVALID",
    );
  }

  return (
    <CenteredCardPage>
      <ResetPasswordForm inviterName={invitation?.inviterName} onboardingIntent={activeIntent?.intent} />
    </CenteredCardPage>
  );
}
