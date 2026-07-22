import type { ComponentProps } from "react";

import { CardFooter } from "@/components/ui/card";
import { cn } from "@/core/utils/cn";

type Props = ComponentProps<typeof CardFooter>;

export function AppCardFooter({ className, ...props }: Props) {
  return (
    <CardFooter
      {...props}
      className={cn("flex w-full items-center justify-end gap-4 overflow-visible p-6 pt-0", className)}
    />
  );
}
