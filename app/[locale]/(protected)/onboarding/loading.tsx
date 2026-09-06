import { getTranslations } from "next-intl/server";

import { PageState } from "@/components/page-state/page-state";
import { SkeletonShape as Shape } from "@/components/page-state/skeleton-shape";
import { CenteredCardPageSkeleton } from "@/components/shared/centered-card-page-skeleton";
import { GridPattern } from "@/components/shared/grid-pattern";

function ChoiceSkeleton() {
  return (
    <div className="relative size-full min-h-0 bg-background isolate">
      <GridPattern />

      <div className="relative size-full min-h-0">
        <CenteredCardPageSkeleton>
          <div className="flex flex-col items-center gap-2 p-6 pb-0 text-center">
            <Shape animated className="size-12 rounded-lg" />

            <Shape animated breathe className="mt-4 h-7 w-2/3 max-w-72" motionPhase={1} />

            <Shape animated className="h-3 w-4/5 max-w-md" motionPhase={2} />
          </div>

          <div className="flex flex-col gap-5 p-6 pt-2">
            <Shape animated className="mx-auto h-7 w-48 max-w-full rounded-full" motionPhase={2} />

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {[0, 1].map((index) => (
                <div
                  key={index}
                  className="flex min-h-36 flex-col gap-2 rounded-xl border border-border bg-secondary p-4"
                >
                  <Shape animated breathe className="h-4 w-3/4" motionPhase={1} />

                  <Shape animated className="h-3 w-full" motionPhase={2} />

                  <Shape animated className="h-3 w-4/5" motionPhase={2} />

                  <Shape animated className="mt-auto h-3 w-1/2" motionPhase={3} />
                </div>
              ))}
            </div>

            <Shape animated className="mx-auto h-3 w-3/4 max-w-sm" motionPhase={3} />
          </div>
        </CenteredCardPageSkeleton>
      </div>
    </div>
  );
}

export default async function Loading() {
  const t = await getTranslations("PageState");

  return <PageState background={<ChoiceSkeleton />} className="h-full flex-1" label={t("loading")} state="loading" />;
}
