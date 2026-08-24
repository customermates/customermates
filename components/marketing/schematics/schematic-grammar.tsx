import type { ReactNode } from "react";

import { cn } from "@/core/utils/cn";

export type SchematicProps = {
  className?: string;
  label?: string;
};

export function SchematicFrame({ children, className, label }: SchematicProps & { children: ReactNode }) {
  return (
    <div
      aria-hidden={label ? undefined : true}
      aria-label={label}
      className={cn("scene-ground scene-frame relative isolate overflow-hidden rounded-card", className)}
      role={label ? "img" : undefined}
    >
      <div className="scene-platform absolute inset-0 flex items-center justify-center px-[6%]">{children}</div>
    </div>
  );
}

export function SchematicFlow({ children }: { children: ReactNode }) {
  return <div className="flex w-full items-center justify-center gap-3">{children}</div>;
}

export function SchematicNode({
  children,
  outside = false,
  title,
}: {
  children?: ReactNode;
  outside?: boolean;
  title: string;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-1 flex-col gap-2 rounded-xl border p-3",
        outside ? "border-dashed border-input bg-transparent" : "border-border bg-card shadow-xs",
      )}
    >
      <span className="truncate text-xs font-medium text-muted-foreground">{title}</span>

      {children}
    </div>
  );
}

export function SchematicEdge({ label }: { label: string }) {
  return (
    <div className="flex shrink-0 flex-col items-center gap-1">
      <span className="font-mono text-[11px] text-muted-foreground">{label}</span>

      <svg aria-hidden className="h-2 w-10 text-border" fill="none" viewBox="0 0 40 8">
        <path d="M0 4h34" stroke="currentColor" strokeWidth="1.5" />

        <path d="M32 1l5 3-5 3" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.5" />
      </svg>
    </div>
  );
}
