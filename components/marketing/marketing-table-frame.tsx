import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type Props = {
  className?: string;
  children: ReactNode;
};

export function MarketingTableFrame({ className, children }: Props) {
  return (
    <div className={cn("relative overflow-hidden rounded-xl bg-card shadow-xs", className)}>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-40 dark:opacity-100"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 0% 0%, rgba(94,74,227,0.08), transparent 60%), radial-gradient(ellipse 70% 60% at 100% 100%, rgba(18,148,144,0.06), transparent 60%)",
        }}
      />

      <div className="relative overflow-x-auto">{children}</div>
    </div>
  );
}
