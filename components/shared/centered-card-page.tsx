import type { ReactNode } from "react";

import { GridPattern } from "./grid-pattern";
import { cn } from "@/core/utils/cn";

export type CenteredCardAlign = "center" | "steps";

type Props = {
  children: ReactNode;
  className?: string;
  align?: CenteredCardAlign;
};

export const CENTERED_CARD_AREA_CLASS = "items-center px-4 py-6 sm:py-10";

export const CENTERED_CARD_STEPS_CLASS =
  "flex w-full items-start justify-center min-h-[min(38rem,calc(100dvh-12rem))]";

export function CenteredCardPage({ children, className, align = "center" }: Props) {
  return (
    <div className={cn("relative size-full overflow-y-auto bg-background isolate", className)}>
      <GridPattern />

      <div className={cn("relative z-10 flex min-h-full w-full justify-center", CENTERED_CARD_AREA_CLASS)}>
        {align === "steps" ? <div className={CENTERED_CARD_STEPS_CLASS}>{children}</div> : children}
      </div>
    </div>
  );
}
