import { getTranslations } from "next-intl/server";

import { PageState } from "@/components/page-state/page-state";
import { PageContainer } from "@/components/shared/page-container";

import { OperatorOverviewPageSkeleton } from "../components/overview/operator-overview-page-skeleton";

export default async function Loading() {
  const t = await getTranslations("PageState");

  return (
    <PageContainer>
      <PageState
        background={<OperatorOverviewPageSkeleton />}
        className="h-[calc(100svh-4rem)] md:h-[calc(100svh-5rem)]"
        label={t("loading")}
        state="loading"
      />
    </PageContainer>
  );
}
