import { SkeletonShape as Shape } from "@/components/page-state/skeleton-shape";

type Props = { animated?: boolean; rows?: number };

export function ActivityTimelineSkeleton({ animated = true, rows = 6 }: Props) {
  const items = Array.from({ length: rows }, (_, index) => index);

  return (
    <div
      aria-hidden="true"
      className="flex w-full flex-col"
      data-page-skeleton-empty={!animated || undefined}
      data-page-skeleton-loading={animated || undefined}
      data-skeleton-kind="activity-timeline"
    >
      {items.map((row) => (
        <div key={row} className="relative flex items-start gap-3 p-2" data-skeleton-group={row % 4}>
          {row > 0 && (
            <span
              aria-hidden
              className="absolute left-[23.5px] top-0 h-[26px] w-px bg-border"
              data-skeleton-connector="before"
            />
          )}

          {row < items.length - 1 && (
            <span
              aria-hidden
              className="absolute left-[23.5px] top-[26px] bottom-0 w-px bg-border"
              data-skeleton-connector="after"
            />
          )}

          <span data-skeleton-node className="bg-background relative z-10 mt-0.5 size-8 shrink-0 rounded-full">
            <Shape animated={animated} breathe={row === 0} className="size-full rounded-full" />
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <Shape animated={animated} className="h-3 w-1/3" motionPhase={1} />

              <Shape animated={animated} className="ml-auto h-2.5 w-16 shrink-0" motionPhase={2} />
            </div>

            <Shape animated={animated} className="mt-1 h-2.5 w-3/5" motionPhase={3} />
          </div>
        </div>
      ))}
    </div>
  );
}
