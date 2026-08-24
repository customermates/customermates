import type { ReactNode } from "react";

export function ThemePair({ children }: { children: ReactNode }) {
  return (
    <div className="marketing-grid gap-y-4">
      <div className="col-span-12 lg:col-span-6">
        <div className="light rounded-card border border-border bg-card p-5 text-foreground">{children}</div>

        <p className="text-meta mt-2.5">Light</p>
      </div>

      <div className="col-span-12 lg:col-span-6">
        <div className="dark rounded-card border border-border bg-card p-5 text-foreground">{children}</div>

        <p className="text-meta mt-2.5">Dark</p>
      </div>
    </div>
  );
}
