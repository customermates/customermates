import type { ComponentProps } from "react";

import { CardHeader } from "@/components/ui/card";
import { cn } from "@/core/utils/cn";

type Props = ComponentProps<typeof CardHeader>;

export function AppCardHeader({ className, ...props }: Props) {
  return <CardHeader {...props} className={cn("z-0 flex w-full items-center gap-4 p-6 pb-0", className)} />;
}
