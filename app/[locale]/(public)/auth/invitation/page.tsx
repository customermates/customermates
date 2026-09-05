import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";

import { InvitationCard } from "./invitation-card";

import { CenteredCardPage } from "@/components/shared/centered-card-page";
import { NOINDEX_METADATA } from "@/core/seo/noindex-metadata";
import { ONBOARDING_INTENT_QUERY_PARAM, pathWithOnboardingIntent } from "@/features/company/onboarding-intent-url";
import { resolveOnboardingIntent } from "@/features/company/next/onboarding-intent";
import { resolveRequestAccountState } from "@/features/auth/next/resolve-account-state";
import { buildLocalePath } from "@/i18n/locale-registry";

export const metadata = NOINDEX_METADATA;

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function InvitationPage({ searchParams }: Props) {
  const locale = await getLocale();
  const params = await searchParams;
  const invitation = await resolveOnboardingIntent(params[ONBOARDING_INTENT_QUERY_PARAM]);
  if (invitation.status !== "valid" || invitation.type !== "invitation") {
    const errorMessage = invitation.status === "invalid" ? invitation.errorMessage : "invalidOnboardingIntent";
    redirect(buildLocalePath(locale, `/auth/error?type=${errorMessage}`));
  }

  const resolution = await resolveRequestAccountState();
  if (!resolution.sessionUser) {
    redirect(
      buildLocalePath(locale, `/auth/signup?${ONBOARDING_INTENT_QUERY_PARAM}=${encodeURIComponent(invitation.intent)}`),
    );
  }
  if (resolution.state === "overdueVerification" && !resolution.user)
    redirect(buildLocalePath(locale, pathWithOnboardingIntent("/auth/verify-email", invitation.intent)));

  return (
    <CenteredCardPage>
      <InvitationCard
        canJoin={resolution.state === "unregistered"}
        email={resolution.sessionUser.email}
        invitationIntent={invitation.intent}
        inviterName={invitation.inviterName}
      />
    </CenteredCardPage>
  );
}
