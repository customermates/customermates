import { getTranslations } from "next-intl/server";

import { PageContainer } from "@/components/shared/page-container";
import { PageState } from "@/components/page-state/page-state";
import { RecordsPageSkeleton } from "./components/records-page-skeleton";

export default async function Loading() {
  const t = await getTranslations();
  return (
    <PageContainer padded={false}>
      <PageState background={<RecordsPageSkeleton />} label={t("PageState.loading")} state="loading" />
    </PageContainer>
  );
}
