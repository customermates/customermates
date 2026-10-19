import { SkeletonShape as Shape } from "@/components/page-state/skeleton-shape";
import { cn } from "@/core/utils/cn";

type Props = { animated?: boolean };

const COLUMNS = ["w-40", "w-16", "w-16", "w-12", "w-12", "w-24", "w-12", "w-12"];
const ROWS = Array.from({ length: 8 }, (_, index) => index);

export function OperatorUsagePageSkeleton({ animated = true }: Props) {
  return (
    <div
      data-operator-usage-page-skeleton
      aria-hidden="true"
      className="flex w-full flex-col rounded-xl border border-border bg-card shadow-xs"
      data-page-skeleton-empty={!animated || undefined}
      data-page-skeleton-loading={animated || undefined}
      data-skeleton-kind="dashboard"
    >
      <div className="flex items-center gap-3 p-6 pb-0" data-skeleton-group={0}>
        <Shape breathe animated={animated} className="size-6 shrink-0 rounded-lg" />

        <Shape animated={animated} className="h-3.5 w-28" motionPhase={1} />
      </div>

      <div className="flex flex-col gap-3 p-6">
        <Shape animated={animated} className="h-3 w-3/4" motionPhase={1} />

        <div className="flex flex-wrap items-center gap-2" data-skeleton-group={1}>
          <Shape animated={animated} className="h-9 w-56 rounded-md" motionPhase={1} />

          <Shape animated={animated} className="h-9 w-28 rounded-md" motionPhase={2} />
        </div>

        <div className="flex flex-col" data-skeleton-group={2}>
          <div className="flex h-10 items-center gap-6 border-b border-border px-2">
            {COLUMNS.map((width, column) => (
              <Shape key={column} animated={animated} className={cn("h-3", width)} motionPhase={2} />
            ))}
          </div>

          {ROWS.map((row) => (
            <div key={row} className="flex h-10 items-center gap-6 border-b border-border px-2 last:border-b-0">
              {COLUMNS.map((width, column) => (
                <Shape key={column} animated={animated} className={cn("h-3", width)} motionPhase={row < 4 ? 2 : 3} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
