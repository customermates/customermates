"use client";

import { useTranslations } from "next-intl";

import { ErrorPageView } from "@/components/shared/error-page-view";

type Props = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function ErrorPage({ error, reset }: Props) {
  const t = useTranslations("ErrorCard");

  return (
    <ErrorPageView
      backHref="/"
      backLabel={t("ctaLabel")}
      body={t("contactSupport")}
      error={error}
      retryLabel={t("retry")}
      subtitle={t("subtitle")}
      title={t("title")}
      onRetry={() => reset()}
    />
  );
}
