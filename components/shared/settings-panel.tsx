import type { ComponentProps, ReactNode } from "react";

import { Plus } from "lucide-react";

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

export function SettingsPanelAddRow({ trailing, children }: { trailing?: ReactNode; children: ReactNode }) {
  return (
    <div
      className="-mt-px flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 border-t border-dashed bg-muted/30 px-4 py-3"
      data-settings-panel-add=""
    >
      {children}

      {trailing}
    </div>
  );
}

type AddButtonProps = ComponentProps<"button"> & { label: string; hint?: string };

export function SettingsPanelAddButton({ label, hint, className, ...props }: AddButtonProps) {
  return (
    <button
      className={cn(
        "group/add -m-1 flex min-w-0 flex-1 basis-56 items-center gap-3 rounded-lg p-1 text-start outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      type="button"
      {...props}
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-dashed border-border-strong text-muted-foreground transition-colors group-hover/add:border-foreground group-hover/add:text-foreground">
        <Plus aria-hidden className="size-4" />
      </span>

      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm font-medium">{label}</span>

        {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
      </span>
    </button>
  );
}

export function SettingsPanelLogo({ children }: { children: ReactNode }) {
  return (
    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border bg-card shadow-xs">
      {children}
    </span>
  );
}
