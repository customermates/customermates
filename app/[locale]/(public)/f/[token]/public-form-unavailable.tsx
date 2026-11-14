"use client";

import { useTranslations } from "next-intl";

import { ErrorPageView } from "@/components/shared/error-page-view";

const HOME_URL = "https://customermates.com";

export function PublicFormUnavailable({ rateLimited }: { rateLimited: boolean }) {
  const t = useTranslations();

  return (
    <ErrorPageView
      backHref={HOME_URL}
      backLabel={t("PublicForm.toHome")}
      body={rateLimited ? t("PublicForm.rateLimitedBody") : t("PublicForm.unavailableBody")}
      subtitle={rateLimited ? t("PublicForm.rateLimitedSubtitle") : t("PublicForm.unavailableSubtitle")}
      title={rateLimited ? t("PublicForm.rateLimitedTitle") : t("PublicForm.unavailableTitle")}
    />
  );
}
