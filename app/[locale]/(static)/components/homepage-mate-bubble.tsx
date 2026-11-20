import type { ReactNode } from "react";

import { cn } from "@/core/utils/cn";

import { HomepageMateLogo } from "./homepage-mate-logo";

export const MATE_NAME = "Mate";

type Props = {
  children: ReactNode;
  className?: string;
};

export function HomepageMateBubble({ children, className }: Props) {
  return (
    <p className={cn("homepage-mate-bubble", className)} data-mate-bubble="">
      <HomepageMateLogo className="mt-0.5 size-5 rounded-[5px]" />

      <span className="min-w-0">
        <span className="homepage-mate-bubble-name">{MATE_NAME}</span>

        {children}
      </span>
    </p>
  );
}
