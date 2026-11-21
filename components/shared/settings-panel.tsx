import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/core/utils/cn";

type PanelProps = {
  id: string;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
};

export function SettingsPanel({ id, title, description, action, footer, children }: PanelProps) {
  const titleId = `${id}-title`;

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-3" data-settings-panel="" id={id}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-0 flex-1 basis-64 flex-col gap-0.5">
          <h2 className="text-x-lg" id={titleId}>
            {title}
          </h2>

          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        </div>

        {action}
      </div>

      <div className="overflow-hidden rounded-xl border bg-card shadow-xs">{children}</div>

      {footer}
    </section>
  );
}

export function SettingsPanelRow({ className, ...props }: ComponentProps<"div">) {
  return (
    <div className={cn("flex min-w-0 items-center gap-3 border-b px-4 py-3 last:border-b-0", className)} {...props} />
  );
}

export function SettingsPanelMessage({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm text-muted-foreground">
      {children}
    </div>
  );
}

export function SettingsPanelLogo({ children }: { children: ReactNode }) {
  return (
    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border bg-card shadow-xs">
      {children}
    </span>
  );
}
