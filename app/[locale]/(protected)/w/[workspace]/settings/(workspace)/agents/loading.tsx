import { getTranslations } from "next-intl/server";

import { AgentRunnersPageSkeleton } from "@/components/agent-runners/agent-runners-page-skeleton";
import { PageState } from "@/components/page-state/page-state";
import { PageContainer } from "@/components/shared/page-container";

export default async function Loading() {
  const t = await getTranslations("PageState");
  return (
    <PageContainer>
      <PageState background={<AgentRunnersPageSkeleton />} label={t("loading")} state="loading" />
    </PageContainer>
  );
}
