import type { ReactNode } from "react";

import { GridPattern } from "./grid-pattern";
import { cn } from "@/core/utils/cn";

type Props = {
  children: ReactNode;
  className?: string;
};

export function CenteredCardPage({ children, className }: Props) {
  return (
    <div className={cn("relative size-full overflow-y-auto bg-background isolate", className)}>
      <GridPattern />

      <div className="relative z-10 flex min-h-full w-full items-center justify-center p-4">{children}</div>
    </div>
  );
}
