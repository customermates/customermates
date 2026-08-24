import type { ReactNode } from "react";

import { cn } from "@/core/utils/cn";

export function ThemePair({ children, stacked = false }: { children: ReactNode; stacked?: boolean }) {
  const column = stacked ? "col-span-12" : "col-span-12 lg:col-span-6";

  return (
    <div className="marketing-grid gap-y-4">
      <div className={cn(column)}>
        <div className="light rounded-card border border-border bg-card p-5 text-foreground">{children}</div>

        <p className="text-meta mt-2.5">Light</p>
      </div>

      <div className={cn(column)}>
        <div className="dark rounded-card border border-border bg-card p-5 text-foreground">{children}</div>

        <p className="text-meta mt-2.5">Dark</p>
      </div>
    </div>
  );
}
