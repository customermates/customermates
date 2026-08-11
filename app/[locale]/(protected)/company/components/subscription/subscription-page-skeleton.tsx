import { SettingsFormSkeleton } from "@/components/forms/settings-form-skeleton";
import { SkeletonShape as Shape } from "@/components/page-state/skeleton-shape";

export function SubscriptionPageSkeleton({ animated = true }: { animated?: boolean }) {
  return (
    <SettingsFormSkeleton data-subscription-page-skeleton animated={animated} className="gap-4">
      <section className="flex w-full flex-col gap-4">
        <div data-settings-field data-subscription-plan-field className="space-y-1.5">
          <Shape breathe animated={animated} className="h-3 w-20" />

          <div className="flex h-9 w-full items-center rounded-md border border-input bg-muted/30 px-3 py-1.5 shadow-xs">
            <div className="flex w-full items-center justify-between gap-2">
              <Shape animated={animated} className="h-3 w-24" motionPhase={1} />

              <Shape
                data-subscription-status-chip
                animated={animated}
                className="h-5 w-16 shrink-0 rounded-full"
                motionPhase={2}
              />
            </div>
          </div>
        </div>
      </section>
    </SettingsFormSkeleton>
  );
}
