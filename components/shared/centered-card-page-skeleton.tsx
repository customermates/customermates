import { SkeletonShape as Shape } from "@/components/page-state/skeleton-shape";
import { cn } from "@/core/utils/cn";
import type { ReactNode } from "react";

type Props = { animated?: boolean; children?: ReactNode; maxWidth?: "2xl" | "3xl" };

export function CenteredCardPageSkeleton({ animated = true, children, maxWidth = "2xl" }: Props) {
  return (
    <div
      aria-hidden="true"
      className="relative size-full min-h-0 overflow-y-auto"
      data-page-skeleton-empty={!animated || undefined}
      data-page-skeleton-loading={animated || undefined}
      data-skeleton-kind="centered-card"
    >
      <div className="flex min-h-full w-full items-center justify-center p-4">
        <div
          className={cn(
            "flex w-full flex-col gap-0 rounded-xl border border-border bg-card py-0 shadow-xs",
            maxWidth === "3xl" ? "max-w-3xl" : "max-w-2xl",
          )}
          data-skeleton-group="0"
        >
          {children ?? (
            <>
              <div data-centered-card-hero className="flex flex-col items-center gap-5 p-6 text-center">
                <Shape animated={animated} className="size-12 rounded-xl" />

                <div className="flex w-full flex-col items-center gap-3">
                  <Shape breathe animated={animated} className="h-5 w-1/2" motionPhase={1} />

                  <Shape animated={animated} className="h-3 w-4/5" motionPhase={2} />

                  <Shape animated={animated} className="h-3 w-2/3" motionPhase={2} />
                </div>
              </div>

              <div data-centered-card-footer className="flex w-full items-center justify-end gap-4 p-6 pt-0">
                <Shape animated={animated} className="h-9 w-32 rounded-md" motionPhase={3} />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
