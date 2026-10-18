"use client";

import { useTranslations } from "next-intl";

import { ErrorPageView } from "@/components/shared/error-page-view";

export type ErrorPageKey =
  | "invalidInviteLink"
  | "invalidOnboardingIntent"
  | "inviteLinkExpired"
  | "onboardingSessionExpired";

export function ErrorPageContent({ errorKey }: { errorKey: ErrorPageKey | null }) {
  const t = useTranslations();

  return (
    <ErrorPageView
      backHref="/"
      backLabel={t("ErrorCard.ctaLabel")}
      body={errorKey ? t(`ErrorCard.${errorKey}`) : t("ErrorCard.contactSupport")}
      subtitle={t("ErrorCard.subtitle")}
      title={t("ErrorCard.title")}
    />
  );
}
