"use client";

import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";

import { ErrorPageView } from "@/components/shared/error-page-view";

const ERROR_KEYS = new Set(["inactiveUser", "invalidInviteLink", "inviteLinkExpired"]);

export default function ErrorPage() {
  const t = useTranslations();
  const requestedErrorKey = useSearchParams().get("type");
  const errorKey = requestedErrorKey && ERROR_KEYS.has(requestedErrorKey) ? requestedErrorKey : null;

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
