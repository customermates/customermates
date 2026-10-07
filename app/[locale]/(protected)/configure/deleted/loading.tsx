import { getTranslations } from "next-intl/server";

import { PageContainer } from "@/components/shared/page-container";
import { PageState } from "@/components/page-state/page-state";
import { RecentlyDeletedSkeleton } from "./components/recently-deleted-skeleton";

export default async function Loading() {
  const t = await getTranslations();
  return (
    <PageContainer>
      <PageState background={<RecentlyDeletedSkeleton />} label={t("PageState.loading")} state="loading" />
    </PageContainer>
  );
}
