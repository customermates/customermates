import type { ReactNode } from "react";

import { ALERT_ICONS } from "@/components/shared/alert";
import { cn } from "@/core/utils/cn";

export function ArticleSummary({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section
      aria-label={title}
      className="not-prose my-10 overflow-hidden rounded-xl border border-border bg-background"
    >
      <div className="border-b border-border bg-sidebar px-5 py-4 sm:px-6">
        <p className="text-eyebrow">{title}</p>
      </div>

      <dl className="grid sm:grid-cols-2">{children}</dl>
    </section>
  );
}

export function SummaryItem({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="border-b border-border p-5 last:border-b-0 sm:border-r sm:p-6 sm:[&:nth-last-child(-n+2)]:border-b-0 sm:[&:nth-child(even)]:border-r-0">
      <dt className="text-meta">{label}</dt>

      <dd className="mt-2 text-sm leading-6 text-foreground/85">{children}</dd>
    </div>
  );
}

export function ProofRail({ children, label }: { children: ReactNode; label: string }) {
  return (
    <section aria-label={label} className="not-prose my-10 border-y border-border">
      <div className="grid sm:grid-cols-2 lg:grid-cols-5">{children}</div>
    </section>
  );
}

export function ProofItem({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="border-b border-border px-4 py-5 last:border-b-0 sm:border-r sm:px-5 sm:last:col-span-2 sm:last:border-r-0 sm:[&:nth-child(even)]:border-r-0 lg:last:col-span-1 lg:border-b-0 lg:[&:nth-child(even)]:border-r lg:last:border-r-0">
      <p className="text-xs font-medium tracking-tight">{label}</p>

      <div className="mt-1 text-xs leading-5 text-muted-foreground">{children}</div>
    </div>
  );
}

const CALLOUT_STYLES = {
  boundary: {
    icon: ALERT_ICONS.warning,
    shell: "border-warning/35 bg-warning/8",
    iconClass: "text-warning",
  },
  fit: {
    icon: ALERT_ICONS.primary,
    shell: "border-primary/30 bg-primary/7",
    iconClass: "text-primary",
  },
  proof: {
    icon: ALERT_ICONS.default,
    shell: "border-border-strong bg-background",
    iconClass: "text-foreground",
  },
} as const;

export function AcquisitionCallout({
  children,
  title,
  variant = "proof",
}: {
  children: ReactNode;
  title: string;
  variant?: keyof typeof CALLOUT_STYLES;
}) {
  const style = CALLOUT_STYLES[variant];
  const CalloutIcon = style.icon;

  return (
    <aside className={cn("not-prose my-10 rounded-xl border p-5 sm:p-6", style.shell)} role="note">
      <div className="flex items-start gap-3">
        <CalloutIcon aria-hidden className={cn("mt-0.5 size-4 shrink-0", style.iconClass)} strokeWidth={1.75} />

        <div className="min-w-0">
          <p className="text-sm font-medium tracking-tight">{title}</p>

          <div className="mt-2 text-sm leading-6 text-foreground/80">{children}</div>
        </div>
      </div>
    </aside>
  );
}
