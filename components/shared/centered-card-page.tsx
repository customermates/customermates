import type { ReactNode } from "react";

import { GridPattern } from "./grid-pattern";
import { cn } from "@/core/utils/cn";

type Props = {
  children: ReactNode;
  className?: string;
  align?: "center" | "top";
};

export const CENTERED_CARD_TOP_CLASS = "items-start px-4 py-6 sm:py-10";

export function CenteredCardPage({ children, className, align = "center" }: Props) {
  return (
    <div className={cn("relative size-full overflow-y-auto bg-background isolate", className)}>
      <GridPattern />

      <div
        className={cn(
          "relative z-10 flex min-h-full w-full justify-center",
          align === "top" ? CENTERED_CARD_TOP_CLASS : "items-center p-4",
        )}
      >
        {children}
      </div>
    </div>
  );
}
