import { SettingsFieldSkeleton, SettingsFormSkeleton } from "@/components/forms/settings-form-skeleton";
import { SkeletonShape as Shape } from "@/components/page-state/skeleton-shape";

const TERMINOLOGY_NODES = Array.from({ length: 4 }, (_, index) => index);

export function CompanySettingsPageSkeleton({ animated = true }: { animated?: boolean }) {
  return (
    <SettingsFormSkeleton data-company-settings-page-skeleton animated={animated}>
      <SettingsFieldSkeleton description short animated={animated} />

      <section data-company-terminology-skeleton className="flex flex-col gap-1.5">
        <Shape breathe animated={animated} className="h-3 w-32" />

        <div className="flex flex-col">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-x-24 sm:gap-y-16">
            {TERMINOLOGY_NODES.map((node) => (
              <Shape
                key={node}
                data-company-terminology-node
                animated={animated}
                className="h-9 w-full rounded-md"
                motionPhase={node % 2 === 0 ? 1 : 2}
              />
            ))}
          </div>

          <div className="flex min-h-6 w-full items-center justify-center sm:min-h-14" data-skeleton-group="2">
            <Shape animated={animated} className="h-full min-h-6 w-px sm:min-h-14" motionPhase={2} />
          </div>

          <Shape data-company-terminology-node animated={animated} className="h-9 w-full rounded-md" motionPhase={3} />
        </div>
      </section>
    </SettingsFormSkeleton>
  );
}
