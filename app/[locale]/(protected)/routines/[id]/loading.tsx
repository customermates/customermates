import { getTranslations } from "next-intl/server";

import { PageState } from "@/components/page-state/page-state";
import { PageContainer } from "@/components/shared/page-container";
import { RoutineDetailSkeleton } from "../components/routine-detail-skeleton";

export default async function Loading() {
  const t = await getTranslations("PageState");
  return (
    <PageContainer>
      <PageState background={<RoutineDetailSkeleton />} label={t("loading")} state="loading" />
    </PageContainer>
  );
}
