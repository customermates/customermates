import { getTranslations } from "next-intl/server";

import { PageContainer } from "@/components/shared/page-container";
import { PageState } from "@/components/page-state/page-state";
import { Skeleton } from "@/components/ui/skeleton";

export default async function Loading() {
  const t = await getTranslations();
  return (
    <PageContainer>
      <PageState
        background={
          <div className="flex w-full max-w-3xl flex-col gap-4">
            <Skeleton className="h-8 w-48" />

            <Skeleton className="h-4 w-80" />

            <Skeleton className="h-64 w-full rounded-xl" />
          </div>
        }
        label={t("PageState.loading")}
        state="loading"
      />
    </PageContainer>
  );
}
