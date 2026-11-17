import { getTranslations } from "next-intl/server";

import { AgentsPageSkeleton } from "@/components/agent-keys/agents-page-skeleton";
import { PageState } from "@/components/page-state/page-state";
import { PageContainer } from "@/components/shared/page-container";

export default async function Loading() {
  const t = await getTranslations("PageState");
  return (
    <PageContainer>
      <PageState background={<AgentsPageSkeleton />} label={t("loading")} state="loading" />
    </PageContainer>
  );
}
