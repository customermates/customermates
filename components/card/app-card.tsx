import type { ComponentProps } from "react";

import { Card } from "@/components/ui/card";
import { cn } from "@/core/utils/cn";

type Props = ComponentProps<typeof Card>;

export function AppCard({ className, ...props }: Props) {
  return (
    <Card
      className={cn(
        "w-full gap-0 py-0",
        "in-data-[slot=dialog-content]:flex-1 in-data-[slot=dialog-content]:min-h-0",
        className,
      )}
      data-uid="app-card"
      {...props}
    />
  );
}
