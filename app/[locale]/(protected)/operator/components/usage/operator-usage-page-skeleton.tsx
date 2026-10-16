import { SkeletonShape as Shape } from "@/components/page-state/skeleton-shape";

type Props = { animated?: boolean };

const ROWS = Array.from({ length: 8 }, (_, index) => index);

export function OperatorUsagePageSkeleton({ animated = true }: Props) {
  return (
    <div
      data-operator-usage-page-skeleton
      aria-hidden="true"
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-6 shadow-xs"
      data-page-skeleton-empty={!animated || undefined}
      data-page-skeleton-loading={animated || undefined}
      data-skeleton-kind="table"
    >
      <Shape breathe animated={animated} className="h-8 w-56" motionPhase={2} />

      {ROWS.map((row) => (
        <div key={row} className="flex items-center gap-6" data-skeleton-group={row}>
          <Shape animated={animated} className="h-3 w-40" motionPhase={row < 4 ? 2 : 3} />

          <Shape animated={animated} className="h-3 w-12" motionPhase={row < 4 ? 2 : 3} />

          <Shape animated={animated} className="h-3 w-12" motionPhase={row < 4 ? 2 : 3} />

          <Shape animated={animated} className="h-3 w-24" motionPhase={row < 4 ? 2 : 3} />
        </div>
      ))}
    </div>
  );
}
