import type { ReactNode } from "react";

import { DotPattern } from "./dot-pattern";
import { cn } from "@/lib/utils";

type Props = {
  children: ReactNode;
  className?: string;
};

export function CenteredCardPage({ children, className }: Props) {
  return (
    <div className={cn("relative size-full overflow-y-auto isolate", className)}>
      <DotPattern />

      <div className="relative z-10 flex min-h-full w-full items-center justify-center p-4">{children}</div>
    </div>
  );
}
