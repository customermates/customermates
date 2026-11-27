import { getTranslations } from "next-intl/server";

import { PageState } from "@/components/page-state/page-state";
import { SkeletonShape as Shape } from "@/components/page-state/skeleton-shape";
import { CenteredCardPageSkeleton } from "@/components/shared/centered-card-page-skeleton";
import { GridPattern } from "@/components/shared/grid-pattern";

function ConnectAgentSkeleton() {
  return (
    <div className="relative size-full min-h-0 bg-background isolate">
      <GridPattern />

      <div className="relative size-full min-h-0">
        <CenteredCardPageSkeleton maxWidth="lg">
          <div className="flex flex-col items-center gap-2 p-6 pb-0 text-center">
            <Shape animated className="size-12 rounded-lg" />

            <Shape animated breathe className="mt-4 h-7 w-2/3" motionPhase={1} />

            <Shape animated className="h-3 w-5/6" motionPhase={2} />
          </div>

          <div className="flex flex-col gap-4 p-6">
            <Shape animated className="h-24 w-full rounded-xl" motionPhase={2} />

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Shape animated className="h-9 w-full rounded-md" motionPhase={3} />

              <Shape animated className="h-9 w-full rounded-md" motionPhase={3} />
            </div>

            <Shape animated className="h-3 w-1/2" motionPhase={3} />
          </div>
        </CenteredCardPageSkeleton>
      </div>
    </div>
  );
}

export default async function Loading() {
  const t = await getTranslations("PageState");

  return (
    <PageState background={<ConnectAgentSkeleton />} className="h-full flex-1" label={t("loading")} state="loading" />
  );
}
