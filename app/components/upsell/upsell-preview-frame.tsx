import type { ReactNode } from "react";

import { cn } from "@/core/utils/cn";

type Props = {
  label: string;
  className?: string;
  children: ReactNode;
};

export function UpsellPreviewFrame({ label, className, children }: Props) {
  return (
    <figure
      aria-label={label}
      className={cn(
        "m-0 flex w-full flex-col gap-1 overflow-hidden rounded-xl border border-border bg-card p-1.5 text-left shadow-sm",
        className,
      )}
      data-upsell-preview=""
    >
      {children}
    </figure>
  );
}

export function UpsellPreviewTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div aria-hidden className="flex items-center justify-between px-2 pt-1 pb-1.5">
      <span className="text-xs font-medium text-foreground">{children}</span>

      {aside}
    </div>
  );
}
