"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";

import { ErrorPageView } from "@/components/shared/error-page-view";
import { captureError } from "@/core/errors/client-reporter";

type Props = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function ErrorPage({ error, reset }: Props) {
  const t = useTranslations();

  useEffect(() => {
    captureError(error);
  }, [error]);

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
