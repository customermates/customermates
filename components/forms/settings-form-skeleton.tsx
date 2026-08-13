import type { ComponentProps } from "react";

import { SkeletonShape as Shape } from "@/components/page-state/skeleton-shape";
import { cn } from "@/core/utils/cn";

type Props = ComponentProps<"div"> & { animated?: boolean };

export function SettingsFieldSkeleton({
  animated,
  description = false,
  short = false,
}: {
  animated: boolean;
  description?: boolean;
  short?: boolean;
}) {
  return (
    <div data-settings-field className="space-y-1.5">
      <Shape breathe animated={animated} className={cn("h-3", short ? "w-20" : "w-28")} />

      <Shape animated={animated} className="h-9 w-full rounded-md" motionPhase={1} />

      {description ? <Shape animated={animated} className="h-3 w-4/5" motionPhase={2} /> : null}
    </div>
  );
}

export function SettingsFormSkeleton({ animated = true, children, className, ...props }: Props) {
  return (
    <div
      aria-hidden="true"
      className={cn("flex w-full max-w-3xl flex-col gap-6", className)}
      data-page-skeleton-empty={!animated || undefined}
      data-page-skeleton-loading={animated || undefined}
      data-skeleton-kind="settings"
      data-skeleton-view="form"
      {...props}
    >
      {children}
    </div>
  );
}
