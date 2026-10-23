import { SkeletonShape as Shape, type SkeletonMotionPhase } from "@/components/page-state/skeleton-shape";

const ROWS = Array.from({ length: 3 }, (_, index) => index);

export function WorkspacesPageSkeleton({ animated = true }: { animated?: boolean }) {
  return (
    <div
      aria-hidden="true"
      className="flex w-full max-w-3xl flex-col gap-4"
      data-page-skeleton-empty={!animated || undefined}
      data-page-skeleton-loading={animated || undefined}
      data-skeleton-kind="settings"
      data-skeleton-view="rows"
    >
      <Shape breathe animated={animated} className="h-3 w-2/3" />

      <div className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card shadow-xs">
        {ROWS.map((row) => {
          const motionPhase = Math.min(row + 1, 3) as SkeletonMotionPhase;
          return (
            <div key={row} className="flex items-center gap-3 px-6 py-3" data-skeleton-group={row}>
              <Shape animated={animated} className="size-8 shrink-0 rounded-lg" motionPhase={motionPhase} />

              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <Shape breathe animated={animated} className="h-3.5 w-40 max-w-full" motionPhase={motionPhase} />

                <Shape animated={animated} className="h-2.5 w-28 max-w-full" motionPhase={motionPhase} />
              </div>

              <Shape animated={animated} className="h-8 w-20 shrink-0 rounded-md" motionPhase={motionPhase} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
