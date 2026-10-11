import type { ReactNode } from "react";

import { cn } from "@/core/utils/cn";

type WindowProps = {
  children: ReactNode;
  chromeClassName?: string;
  className?: string;
  label?: string;
  status?: ReactNode;
};

type FrameProps = {
  children: ReactNode;
  className?: string;
};

export function ProductWindow({ children, chromeClassName, className, label, status }: WindowProps) {
  return (
    <div
      data-homepage-window
      className={cn(
        "relative overflow-hidden rounded-xl border border-foreground/10 bg-card shadow-[inset_0_1px_0_0_rgb(255_255_255/0.5),0_2px_6px_-2px_rgb(0_0_0/0.08),0_28px_72px_-28px_rgb(0_0_0/0.3)] dark:shadow-[inset_0_1px_0_0_rgb(255_255_255/0.07),0_2px_6px_-2px_rgb(0_0_0/0.4),0_36px_96px_-32px_rgb(0_0_0/0.85)]",
        className,
      )}
    >
      {label === undefined ? null : (
        <div
          data-homepage-window-chrome
          className={cn(
            "relative flex h-9 items-center border-b border-foreground/[0.07] bg-foreground/[0.025] px-4",
            chromeClassName,
          )}
        >
          <span aria-hidden className="flex gap-1.5">
            <span className="size-2.5 rounded-full bg-foreground/15" />

            <span className="size-2.5 rounded-full bg-foreground/15" />

            <span className="size-2.5 rounded-full bg-foreground/15" />
          </span>

          <span className="absolute inset-x-28 truncate text-center text-xs font-medium text-muted-foreground">
            {label}
          </span>

          <span className="ml-auto flex items-center gap-1.5 text-xs font-medium text-muted-foreground">{status}</span>
        </div>
      )}

      {children}
    </div>
  );
}

export function ProductPanel({ children, className }: FrameProps) {
  return (
    <div
      data-homepage-panel
      className={cn(
        "relative isolate overflow-hidden rounded-3xl border border-foreground/[0.08] bg-foreground/[0.025]",
        className,
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(85%_65%_at_15%_0%,color-mix(in_oklab,var(--color-primary)_16%,transparent),transparent_70%)]"
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
        "rounded-[2.6rem] bg-neutral-950 p-[0.45rem] shadow-[0_36px_80px_-24px_rgb(0_0_0/0.6)] ring-1 ring-foreground/15",
        className,
      )}
    >
      <div className="overflow-hidden rounded-[2.2rem]">{children}</div>
    </div>
  );
}
