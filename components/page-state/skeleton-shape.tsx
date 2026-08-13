import type { ComponentProps } from "react";

import { Skeleton } from "@/components/ui/skeleton";

export type SkeletonMotionPhase = 0 | 1 | 2 | 3;

type Props = Omit<ComponentProps<typeof Skeleton>, "animated"> & {
  animated: boolean;
  breathe?: boolean;
  motionPhase?: SkeletonMotionPhase;
};

export function SkeletonShape({ animated, breathe = false, motionPhase = 0, ...props }: Props) {
  return (
    <Skeleton
      data-skeleton-shape
      animated={false}
      data-loading-shape={animated || undefined}
      data-skeleton-breathe={(animated && breathe) || undefined}
      data-skeleton-motion={animated ? motionPhase : undefined}
      {...props}
    />
  );
}
