import { getTranslations } from "next-intl/server";

import { DataViewSkeleton } from "@/components/data-view/data-view-skeleton";
import { PageContainer } from "@/components/shared/page-container";
import { PageState } from "@/components/page-state/page-state";

export default async function Loading() {
  const t = await getTranslations();
  return (
    <PageContainer padded={false}>
      <PageState
        background={<DataViewSkeleton spec={{ view: "calendar" }} />}
        label={t("PageState.loading")}
        state="loading"
      />
    </PageContainer>
  );
}
