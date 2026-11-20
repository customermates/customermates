import { SettingsFormSkeleton } from "@/components/forms/settings-form-skeleton";
import { SkeletonShape as Shape } from "@/components/page-state/skeleton-shape";

const CARDS = [0, 1, 2];

export function AgentsPageSkeleton({ animated = true }: { animated?: boolean }) {
  return (
    <SettingsFormSkeleton data-agents-page-skeleton animated={animated} className="gap-4">
      {CARDS.map((card) => (
        <div key={card} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-xs">
          <Shape breathe animated={animated} className="h-3 w-32" />

          <Shape animated={animated} className="h-3 w-4/5" motionPhase={1} />

          <Shape animated={animated} className="h-12 w-full rounded-md" motionPhase={2} />
        </div>
      ))}
    </SettingsFormSkeleton>
  );
}
