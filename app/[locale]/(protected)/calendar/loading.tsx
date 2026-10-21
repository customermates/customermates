import { PageContainer } from "@/components/shared/page-container";
import { PageState } from "@/components/page-state/page-state";
import { getTranslations } from "next-intl/server";
import { PlannerSkeleton } from "./components/planner-skeleton";

export default async function Loading() {
  const t = await getTranslations("PageState");
  return (
    <PageContainer>
      <PageState
        background={<PlannerSkeleton />}
        className="h-[calc(100svh-4rem)] md:h-[calc(100svh-5rem)]"
        label={t("loading")}
        state="loading"
      />
    </PageContainer>
  );
}
