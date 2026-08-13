import { CenteredCardPageSkeleton } from "@/components/shared/centered-card-page-skeleton";
import { SkeletonShape as Shape } from "@/components/page-state/skeleton-shape";

export function OnboardingPageSkeleton({ animated = true }: { animated?: boolean }) {
  return (
    <CenteredCardPageSkeleton animated={animated}>
      <div data-onboarding-profile-skeleton className="flex min-h-0 flex-1 flex-col gap-4 p-6">
        <div className="flex flex-col gap-1">
          <Shape animated={animated} className="h-3 w-20" />

          <Shape breathe animated={animated} className="h-7 w-1/2" motionPhase={1} />

          <Shape animated={animated} className="h-3 w-4/5" motionPhase={2} />
        </div>

        <Shape animated={animated} className="h-1 w-full rounded-full" motionPhase={2} />

        <div className="flex flex-col gap-3">
          <OnboardingField animated={animated} />

          <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
            <OnboardingField animated={animated} />

            <OnboardingField animated={animated} />
          </div>

          <OnboardingField animated={animated} />

          <div data-onboarding-checkbox className="flex items-start gap-2">
            <Shape animated={animated} className="size-4 shrink-0 rounded" motionPhase={2} />

            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <Shape animated={animated} className="h-3 w-full" motionPhase={2} />

              <Shape animated={animated} className="h-3 w-4/5" motionPhase={3} />
            </div>
          </div>

          <Shape
            data-onboarding-continue
            animated={animated}
            className="h-9 w-24 self-end rounded-md"
            motionPhase={3}
          />
        </div>
      </div>
    </CenteredCardPageSkeleton>
  );
}

function OnboardingField({ animated }: { animated: boolean }) {
  return (
    <div data-onboarding-field className="space-y-1.5">
      <Shape breathe animated={animated} className="h-3 w-24" />

      <Shape animated={animated} className="h-9 w-full rounded-md" motionPhase={1} />
    </div>
  );
}
