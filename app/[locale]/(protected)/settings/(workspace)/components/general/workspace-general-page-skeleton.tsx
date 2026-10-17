import { SettingsFieldSkeleton, SettingsFormSkeleton } from "@/components/forms/settings-form-skeleton";
import { SkeletonShape as Shape } from "@/components/page-state/skeleton-shape";

export function WorkspaceGeneralPageSkeleton({ animated = true }: { animated?: boolean }) {
  return (
    <SettingsFormSkeleton data-workspace-general-page-skeleton animated={animated}>
      <div className="flex min-w-0 items-center gap-3">
        <Shape animated={animated} className="size-16 shrink-0 rounded-lg" />

        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <Shape breathe animated={animated} className="h-4 w-40 max-w-full" />

          <Shape animated={animated} className="h-3 w-24 max-w-full" motionPhase={1} />
        </div>
      </div>

      <SettingsFieldSkeleton description animated={animated} />

      <div className="flex flex-col gap-3" data-skeleton-group="1">
        <Shape animated={animated} className="h-3 w-24" motionPhase={2} />

        <Shape animated={animated} className="h-20 w-full rounded-lg" motionPhase={3} />
      </div>
    </SettingsFormSkeleton>
  );
}
