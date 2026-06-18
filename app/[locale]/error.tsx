"use client";

import { useTranslations } from "next-intl";

import { ErrorPageView } from "@/components/shared/error-page-view";

type Props = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function ErrorPage({ reset }: Props) {
  const t = useTranslations();

  return (
    <ErrorPageView
      backHref="/"
      backLabel={t("ErrorCard.ctaLabel")}
      body={t("ErrorCard.contactSupport")}
      retryLabel={t("ErrorCard.retry")}
      subtitle={t("ErrorCard.subtitle")}
      title={t("ErrorCard.title")}
      onRetry={() => reset()}
    />
  );
}
