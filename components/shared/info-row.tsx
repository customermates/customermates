import type { ReactNode } from "react";

type Props = {
  label: string;
  children: ReactNode;
};

export function InfoRow({ label, children }: Props) {
  return (
    <div className="flex w-full items-center justify-between gap-3 text-sm">
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>

      <span className="min-w-0 truncate text-right">{children}</span>
    </div>
  );
}
