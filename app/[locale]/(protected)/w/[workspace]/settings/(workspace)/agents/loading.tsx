import { getTranslations } from "next-intl/server";

<<<<<<<< HEAD:app/[locale]/(protected)/w/[workspace]/settings/(workspace)/agents/loading.tsx
import { AgentRunnersPageSkeleton } from "@/components/agent-runners/agent-runners-page-skeleton";
========
import { ConnectedAccountsPageSkeleton } from "@/app/[locale]/(protected)/w/[workspace]/settings/(account)/components/profile-resource-page-skeleton";
>>>>>>>> 64d9ca8fe (feat(settings): one Connections page with channel, app, agent and developer tabs):app/[locale]/(protected)/w/[workspace]/settings/(workspace)/connections/loading.tsx
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
