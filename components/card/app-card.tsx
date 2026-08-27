import type { ComponentProps } from "react";

import { Card } from "@/components/ui/card";
import { cn } from "@/core/utils/cn";

type Props = ComponentProps<typeof Card>;

export function AppCard({ className, ...props }: Props) {
  return (
    <Card
      className={cn(
        "w-full gap-0 bg-background py-0 text-foreground",
        "in-data-overlay-surface:min-h-0 in-data-overlay-surface:flex-1 in-data-overlay-surface:overflow-hidden",
        "in-data-[overlay-surface=drawer]:border-0 in-data-[overlay-surface=drawer]:bg-transparent in-data-[overlay-surface=drawer]:shadow-none",
        className,
      )}
      data-uid="app-card"
      {...props}
    />
  );
}
