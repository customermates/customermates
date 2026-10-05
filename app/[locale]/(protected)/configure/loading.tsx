import { getTranslations } from "next-intl/server";

import { PageContainer } from "@/components/shared/page-container";
import { PageState } from "@/components/page-state/page-state";
import { Skeleton } from "@/components/ui/skeleton";

export default async function Loading() {
  const t = await getTranslations();
  return (
    <PageContainer padded={false}>
      <PageState
        background={
          <div className="grid h-full lg:grid-cols-[16rem_minmax(0,1fr)]">
            <div className="hidden space-y-2 border-r border-border p-3 lg:block">
              <Skeleton className="h-8 w-full" />

              <Skeleton className="h-6 w-3/4" />

              <Skeleton className="h-6 w-2/3" />

              <Skeleton className="h-6 w-3/4" />
            </div>

            <div className="mx-auto w-full max-w-5xl space-y-6 p-6 md:p-8">
              <Skeleton className="h-8 w-48" />

              <Skeleton className="h-56 w-full rounded-xl" />

              <Skeleton className="h-72 w-full rounded-xl" />
            </div>
          </div>
        }
        className="h-[calc(100svh-4rem)] md:h-[calc(100svh-5rem)]"
        label={t("PageState.loading")}
        state="loading"
      />
    </PageContainer>
  );
}
