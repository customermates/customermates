"use client";

import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";

import { ErrorPageView } from "@/components/shared/error-page-view";

export default function ErrorPage() {
  const t = useTranslations("ErrorCard");
  const errorKey = useSearchParams().get("type");

  return (
    <ErrorPageView
      backHref="/"
      backLabel={t("ctaLabel")}
      body={errorKey ? t(errorKey) : t("contactSupport")}
      subtitle={t("subtitle")}
      title={t("title")}
    />
  );
}
