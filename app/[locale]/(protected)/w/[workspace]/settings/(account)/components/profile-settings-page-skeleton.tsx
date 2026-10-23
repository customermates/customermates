import { SettingsFieldSkeleton, SettingsFormSkeleton } from "@/components/forms/settings-form-skeleton";
import { SkeletonShape as Shape } from "@/components/page-state/skeleton-shape";

const PROFILE_FIELDS = Array.from({ length: 5 }, (_, index) => index);

export function ProfileSettingsPageSkeleton({ animated = true }: { animated?: boolean }) {
  return (
    <SettingsFormSkeleton data-profile-settings-page-skeleton animated={animated}>
      <div data-profile-settings-avatar className="flex min-w-0 items-center gap-3">
        <Shape animated={animated} className="size-16 shrink-0 rounded-lg" />

        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <Shape breathe animated={animated} className="h-4 w-32 max-w-full" />

          <Shape animated={animated} className="h-3 w-48 max-w-full" motionPhase={1} />

          <div className="flex flex-wrap gap-2">
            <Shape animated={animated} className="h-5 w-16 rounded-full" motionPhase={2} />

            <Shape animated={animated} className="h-5 w-14 rounded-full" motionPhase={2} />

            <Shape animated={animated} className="h-5 w-20 rounded-full" motionPhase={3} />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
          <SettingsFieldSkeleton short animated={animated} />

          <SettingsFieldSkeleton short animated={animated} />
        </div>

        {PROFILE_FIELDS.map((field) => (
          <div key={field} data-skeleton-group={field % 4}>
            <SettingsFieldSkeleton animated={animated} short={field % 2 === 0} />
          </div>
        ))}
      </div>
    </SettingsFormSkeleton>
  );
}
