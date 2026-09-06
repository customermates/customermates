import { getTranslations } from "next-intl/server";

import { PageState } from "@/components/page-state/page-state";
import { SkeletonShape as Shape } from "@/components/page-state/skeleton-shape";
import { CenteredCardPageSkeleton } from "@/components/shared/centered-card-page-skeleton";
import { GridPattern } from "@/components/shared/grid-pattern";

function JoinSkeleton() {
  return (
    <div className="relative size-full min-h-0 bg-background isolate">
      <GridPattern />

      <div className="relative size-full min-h-0">
        <CenteredCardPageSkeleton maxWidth="lg">
          <div className="flex flex-col items-center gap-2 p-6 pb-0 text-center">
            <Shape animated className="size-12 rounded-lg" />

            <Shape animated breathe className="mt-4 h-7 w-3/4" motionPhase={1} />

            <Shape animated className="h-3 w-5/6" motionPhase={2} />
          </div>

          <div className="flex flex-col gap-5 p-6 pt-2">
            <div className="space-y-2">
              <Shape animated className="h-4 w-40" motionPhase={1} />

              <Shape animated className="h-9 w-full rounded-md" motionPhase={2} />
            </div>

            <div className="relative ms-2 border-s border-border ps-6 sm:ms-4 sm:ps-7">
              {[0, 1, 2].map((index) => (
                <div key={index} className="relative pb-10 ps-1 last:pb-0">
                  <Shape
                    animated
                    className="absolute -start-10 size-8 rounded-full sm:-start-11"
                    motionPhase={index === 0 ? 1 : 2}
                  />

                  <Shape animated breathe className="h-5 w-2/3" motionPhase={index === 0 ? 1 : 2} />

                  <Shape animated className="mt-3 h-3 w-full" motionPhase={index === 2 ? 3 : 2} />
                </div>
              ))}
            </div>

            <div className="flex gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3.5">
              <Shape animated className="size-8 shrink-0 rounded-lg" motionPhase={2} />

              <div className="flex-1 space-y-2">
                <Shape animated breathe className="h-4 w-1/2" motionPhase={2} />

                <Shape animated className="h-3 w-full" motionPhase={3} />
              </div>
            </div>
          </div>

          <div className="flex w-full p-6 pt-0">
            <Shape animated className="h-9 w-full rounded-md" motionPhase={3} />
          </div>
        </CenteredCardPageSkeleton>
      </div>
    </div>
  );
}

export default async function Loading() {
  const t = await getTranslations("PageState");

  return <PageState background={<JoinSkeleton />} className="h-full flex-1" label={t("loading")} state="loading" />;
}
