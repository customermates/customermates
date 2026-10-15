"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";

import { ErrorPageView } from "@/components/shared/error-page-view";
import { isWorkspaceChangedError } from "@/core/errors/workspace-changed";
import { notifyWorkspaceChanged } from "@/core/errors/report-application-error";

type Props = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function ErrorPage({ error, reset }: Props) {
  const t = useTranslations();

  useEffect(() => {
    if (isWorkspaceChangedError(error)) notifyWorkspaceChanged();
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
