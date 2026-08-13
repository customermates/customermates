"use client";

import { useTranslations } from "next-intl";

import { ErrorPageView } from "@/components/shared/error-page-view";

export type ErrorPageKey = "inactiveUser" | "invalidInviteLink" | "inviteLinkExpired";

export function ErrorPageContent({ errorKey, isInactive }: { errorKey: ErrorPageKey | null; isInactive: boolean }) {
  const t = useTranslations();

  return (
    <ErrorPageView
      backHref={isInactive ? undefined : "/"}
      backLabel={isInactive ? undefined : t("ErrorCard.ctaLabel")}
      body={errorKey ? t(`ErrorCard.${errorKey}`) : t("ErrorCard.contactSupport")}
      retryLabel={isInactive ? t("Common.actions.refresh") : undefined}
      subtitle={t("ErrorCard.subtitle")}
      title={t("ErrorCard.title")}
      onRetry={isInactive ? () => window.location.reload() : undefined}
    />
  );
}
