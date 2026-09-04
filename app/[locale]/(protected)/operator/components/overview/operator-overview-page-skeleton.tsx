import { SkeletonShape as Shape } from "@/components/page-state/skeleton-shape";

type Props = { animated?: boolean };

const TILES = Array.from({ length: 9 }, (_, index) => index);

export function OperatorOverviewPageSkeleton({ animated = true }: Props) {
  return (
    <div
      data-operator-overview-page-skeleton
      aria-hidden="true"
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
      data-page-skeleton-empty={!animated || undefined}
      data-page-skeleton-loading={animated || undefined}
      data-skeleton-kind="dashboard"
    >
      {TILES.map((tile) => (
        <div
          key={tile}
          className="flex h-32 flex-col justify-center gap-3 rounded-xl border border-border bg-card p-6 shadow-xs"
          data-skeleton-group={tile}
        >
          <Shape animated={animated} className="h-3 w-16" motionPhase={tile < 4 ? 2 : 3} />

          <Shape animated={animated} breathe={tile === 0} className="h-7 w-24" motionPhase={tile < 4 ? 2 : 3} />

          <Shape animated={animated} className="h-2.5 w-32" motionPhase={tile < 4 ? 2 : 3} />
        </div>
      ))}
    </div>
  );
}
