import { SettingsFieldSkeleton, SettingsFormSkeleton } from "@/components/forms/settings-form-skeleton";
import { SkeletonShape as Shape } from "@/components/page-state/skeleton-shape";

export function CompanySettingsPageSkeleton({ animated = true }: { animated?: boolean }) {
  return (
    <SettingsFormSkeleton data-company-settings-page-skeleton animated={animated}>
      <SettingsFieldSkeleton animated={animated} />

      <section className="flex flex-col gap-3 border-t border-border pt-6">
        <Shape breathe animated={animated} className="h-3 w-32" />

        <Shape animated={animated} className="h-8 w-32 rounded-md" motionPhase={1} />
      </section>
    </SettingsFormSkeleton>
  );
}
