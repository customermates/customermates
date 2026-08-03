import type { ComponentProps } from "react";

import { CardContent } from "@/components/ui/card";
import { cn } from "@/core/utils/cn";

type Props = ComponentProps<typeof CardContent>;

export function AppCardBody({ className, ...props }: Props) {
  return (
    <CardContent
      {...props}
      className={cn(
        "flex min-h-0 flex-1 flex-col gap-4 p-6",
        "in-data-overlay-surface:overflow-x-clip in-data-overlay-surface:overflow-y-auto in-data-overlay-surface:overscroll-contain in-data-overlay-surface:[overflow-clip-margin:8px]",
        className,
      )}
    />
  );
}
