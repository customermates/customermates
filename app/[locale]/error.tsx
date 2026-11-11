"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";

import { captureError } from "@/core/errors/client-reporter";
import { ErrorPageView } from "@/components/shared/error-page-view";
import { isDeploymentSkewError } from "@/core/errors/deployment-skew";
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
    else if (!isDeploymentSkewError(error)) captureError(error);
  }, [error]);

  if (isWorkspaceChangedError(error)) return null;

  if (isDeploymentSkewError(error)) {
    return (
      <ErrorPageView
        backHref="/"
        backLabel={t("ErrorCard.ctaLabel")}
        body={t("ErrorCard.newVersion")}
        retryLabel={t("ErrorCard.reload")}
        subtitle={t("ErrorCard.subtitle")}
        title={t("ErrorCard.title")}
        onRetry={() => window.location.reload()}
      />
    );
  }

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
