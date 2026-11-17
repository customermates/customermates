import { SkeletonShape as Shape } from "@/components/page-state/skeleton-shape";

type Props = { animated?: boolean };

const CARDS = Array.from({ length: 2 }, (_, index) => index);

export function AgentRunnersPageSkeleton({ animated = true }: Props) {
  return (
    <div
      data-agent-runners-page-skeleton
      aria-hidden="true"
      className="flex size-full min-h-[32rem] max-w-3xl flex-col gap-4"
      data-page-skeleton-empty={!animated || undefined}
      data-page-skeleton-loading={animated || undefined}
      data-skeleton-kind="settings"
    >
      <div className="flex flex-col gap-2">
        <Shape breathe animated={animated} className="h-5 w-32" motionPhase={1} />

        <Shape animated={animated} className="h-3 w-4/5" motionPhase={2} />
      </div>

      {CARDS.map((card) => (
        <div key={card} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-xs">
          <Shape breathe animated={animated} className="h-3 w-1/3" motionPhase={1} />

          <Shape animated={animated} className="h-2.5 w-2/3" motionPhase={2} />

          <Shape animated={animated} className="h-2.5 w-1/2" motionPhase={3} />
        </div>
      ))}
    </div>
  );
}
