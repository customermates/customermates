import { getTranslations } from "next-intl/server";

import { PageContainer } from "@/components/shared/page-container";
import { PageState } from "@/components/page-state/page-state";

import { ConfigureGraphSkeleton } from "./components/configure-graph-skeleton";

export default async function Loading() {
  const t = await getTranslations();
  return (
    <PageContainer padded={false}>
      <PageState
        background={<ConfigureGraphSkeleton />}
        className="h-[calc(100svh-4rem)] md:h-[calc(100svh-5rem)]"
        label={t("PageState.loading")}
        state="loading"
      />
    </PageContainer>
  );
}
