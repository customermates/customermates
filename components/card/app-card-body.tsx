import type { ComponentProps } from "react";

import { CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Props = ComponentProps<typeof CardContent>;

export function AppCardBody({ className, ...props }: Props) {
  return (
    <CardContent
      {...props}
      className={cn(
        "flex flex-1 flex-col gap-4 p-6 min-h-0",
        "in-data-[slot=dialog-content]:overflow-y-auto in-data-[slot=dialog-content]:overflow-x-clip in-data-[slot=dialog-content]:[overflow-clip-margin:8px]",
        className,
      )}
    />
  );
}
