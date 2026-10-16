import type { ReactNode } from "react";

import { cn } from "@/core/utils/cn";

type FrameProps = {
  children: ReactNode;
  className?: string;
};

export function ProductWindow({ children, className }: FrameProps) {
  return (
    <div
      data-homepage-window
      className={cn(
        "relative overflow-hidden rounded-xl bg-sidebar shadow-[0_2px_8px_-2px_rgb(0_0_0/0.08),0_32px_80px_-32px_rgb(0_0_0/0.35)] ring-1 ring-foreground/10 dark:shadow-[0_2px_8px_-2px_rgb(0_0_0/0.5),0_40px_110px_-36px_rgb(0_0_0/0.9)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function ProductPanel({ children, className }: FrameProps) {
  return (
    <div
      data-homepage-panel
      data-reveal
      className={cn(
        "relative isolate overflow-hidden rounded-3xl border border-foreground/[0.08] bg-foreground/[0.025]",
        className,
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(85%_65%_at_15%_0%,color-mix(in_oklab,var(--primary)_14%,transparent),transparent_70%)]"
      />

      {children}
    </div>
  );
}

export function PhoneFrame({ children, className }: FrameProps) {
  return (
    <div
      data-homepage-phone
      className={cn(
        "relative rounded-[1.9rem] bg-background/70 p-1.5 shadow-[0_2px_8px_-2px_rgb(0_0_0/0.08),0_32px_80px_-32px_rgb(0_0_0/0.35)] ring-1 ring-foreground/10 backdrop-blur-xl dark:shadow-[0_2px_8px_-2px_rgb(0_0_0/0.5),0_40px_110px_-36px_rgb(0_0_0/0.9)]",
        className,
      )}
    >
      <div className="relative overflow-hidden rounded-[1.55rem] bg-sidebar ring-1 ring-foreground/[0.08]">
        {children}
      </div>
    </div>
  );
}
