import type { ComponentProps } from "react";

import { CardHeader } from "@/components/ui/card";
import { OVERLAY_HEADER_ALIGNMENT_CLASS } from "@/components/ui/overlay-contract";
import { cn } from "@/core/utils/cn";

type Props = ComponentProps<typeof CardHeader>;

export function AppCardHeader({ className, ...props }: Props) {
  return (
    <CardHeader
      {...props}
      className={cn(
        "z-0 flex w-full shrink-0 items-center gap-4 p-6 pb-0 *:min-w-0",
        "in-data-overlay-close:pr-14",
        "in-data-[overlay-action-count=1]:pr-24!",
        "in-data-[overlay-action-count=2]:pr-36!",
        "in-data-[overlay-action-count=3]:pr-46!",
        "in-data-[overlay-action-count=4]:pr-57!",
        OVERLAY_HEADER_ALIGNMENT_CLASS,
        className,
      )}
    />
  );
}
