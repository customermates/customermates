"use client";

import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";

import { ErrorPageView } from "@/components/shared/error-page-view";

export default function ErrorPage() {
  const t = useTranslations();
  const errorKey = useSearchParams().get("type");

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
