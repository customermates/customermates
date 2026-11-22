import type { ReactNode } from "react";

import { MateOrb } from "@/components/mate/mate-orb";
import { cn } from "@/core/utils/cn";

export const MATE_NAME = "Mate";

type Props = {
  children: ReactNode;
  className?: string;
};

export function HomepageMateBubble({ children, className }: Props) {
  return (
    <p className={cn("homepage-mate-bubble", className)} data-mate-bubble="">
      <MateOrb className="mt-0.5 size-5" />

      <span className="min-w-0">
        <span className="homepage-mate-bubble-name">{MATE_NAME}</span>

        {children}
      </span>
    </p>
  );
}
