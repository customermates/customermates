import { getTranslations } from "next-intl/server";

import { PageState } from "@/components/page-state/page-state";
import { PageContainer } from "@/components/shared/page-container";
import { WorkspacesPageSkeleton } from "../components/workspaces-page-skeleton";

export default async function Loading() {
  const t = await getTranslations("PageState");
  return (
    <PageContainer>
      <PageState background={<WorkspacesPageSkeleton />} label={t("loading")} state="loading" />
    </PageContainer>
  );
}
