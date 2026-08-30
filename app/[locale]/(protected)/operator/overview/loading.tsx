import { getTranslations } from "next-intl/server";

import { PageState } from "@/components/page-state/page-state";
import { PageContainer } from "@/components/shared/page-container";

import { OperatorOverviewSkeleton } from "./operator-overview-skeleton";

export default async function Loading() {
  const t = await getTranslations("PageState");

  return (
    <PageContainer>
      <PageState background={<OperatorOverviewSkeleton />} label={t("loading")} state="loading" />
    </PageContainer>
  );
}
