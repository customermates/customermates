import type { ReactNode } from "react";

type Props = {
  label: ReactNode;
  labelEndAddon?: ReactNode;
  children: ReactNode;
};

export function InfoRow({ label, labelEndAddon, children }: Props) {
  return (
    <div className="flex w-full items-center justify-between gap-3 text-sm">
      <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
        <span>{label}</span>

        {labelEndAddon}
      </span>

      <span className="min-w-0 truncate text-right">{children}</span>
    </div>
  );
}
