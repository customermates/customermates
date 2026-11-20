import { SkeletonShape as Shape } from "@/components/page-state/skeleton-shape";

const ROWS = Array.from({ length: 8 }, (_, index) => index);
const CHIPS = ["w-12", "w-24", "w-32", "w-28"] as const;

export function NotificationsPageSkeleton({ animated = true }: { animated?: boolean }) {
  return (
    <div
      data-notifications-page-skeleton
      className="flex w-full flex-col"
      {...(animated ? { "data-page-skeleton-loading": "true" } : { "data-page-skeleton-empty": "true" })}
    >
      <div className="flex flex-wrap items-center gap-1 border-b border-border px-4 pt-1 pb-4" data-joins-top-bar="">
        {CHIPS.map((width, index) => (
          <Shape key={index} animated={animated} className={`h-7 rounded-full ${width}`} motionPhase={1} />
        ))}
      </div>

      {ROWS.map((row) => (
        <div
          key={row}
          className="flex items-start gap-3 border-b border-border px-4 py-3"
          data-skeleton-group={row % 4}
        >
          <Shape animated={animated} className="mt-1.5 size-2 shrink-0 rounded-full" />

          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="flex items-center justify-between gap-3">
              <Shape breathe animated={animated} className="h-3.5 w-2/5" motionPhase={1} />

              <Shape animated={animated} className="h-3 w-14" motionPhase={2} />
            </div>

            <Shape animated={animated} className="h-3 w-4/5" motionPhase={3} />
          </div>
        </div>
      ))}
    </div>
  );
}
