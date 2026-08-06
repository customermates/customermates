import type { ComponentProps } from "react";

import { CardFooter } from "@/components/ui/card";
import { cn } from "@/core/utils/cn";

type Props = ComponentProps<typeof CardFooter>;

export function AppCardFooter({ className, ...props }: Props) {
  return (
    <CardFooter
      {...props}
      className={cn(
        "flex w-full shrink-0 flex-wrap items-center justify-end gap-4 overflow-visible p-6 pt-0",
        "in-data-[overlay-surface=sheet]:pb-[calc(1.5rem+var(--safe-bottom))]",
        "in-data-[overlay-surface=drawer]:flex-col-reverse in-data-[overlay-surface=drawer]:flex-nowrap in-data-[overlay-surface=drawer]:items-stretch in-data-[overlay-surface=drawer]:gap-2 in-data-[overlay-surface=drawer]:pb-[calc(1.5rem+var(--safe-bottom))]",
        className,
      )}
    />
  );
}
