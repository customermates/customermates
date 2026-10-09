"use client";

import type { ComponentProps, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import { createContext, useContext } from "react";

import { AppLink } from "@/components/shared/app-link";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { cn } from "@/core/utils/cn";

type RowLead = "none" | "marker" | "icon";

const RowLeadContext = createContext<RowLead>("none");

const MORE_INSET: Record<RowLead, string | undefined> = { none: undefined, marker: "ps-9", icon: "ps-10" };

const HEADER_TRIGGER =
  "flex min-w-0 flex-1 items-center gap-2.5 px-3.5 pt-3 pb-2.5 text-left outline-none hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset disabled:pointer-events-none";

const ROW_BUTTON =
  "nodrag flex h-9 w-full items-center gap-2 px-3.5 text-left text-sm outline-none hover:bg-accent/50 focus-visible:bg-accent/60 disabled:pointer-events-none";

export function ConfigureNode({ dashed = false, className, ...props }: ComponentProps<"div"> & { dashed?: boolean }) {
  return (
    <div
      className={cn(
        "w-[22rem] rounded-xl border border-border text-card-foreground",
        dashed ? "border-dashed bg-card/80" : "bg-card shadow-sm",
        className,
      )}
      {...props}
    />
  );
}

type HeaderTarget =
  | { href: string; onClick?: never; disabled?: never }
  | { onClick: () => void; disabled?: boolean; href?: never }
  | { href?: never; onClick?: never; disabled?: never };

export function ConfigureNodeHeader({
  icon: Icon,
  name,
  kind,
  badge,
  action,
  label,
  ...target
}: HeaderTarget & {
  icon: LucideIcon;
  name: string;
  kind?: string;
  badge?: ReactNode;
  action?: ReactNode;
  label?: string;
}) {
  const content = (
    <>
      <Icon aria-hidden className="size-4 shrink-0" />

      <span className="min-w-0 flex-1 truncate text-base font-semibold">{name}</span>

      {kind && <span className="shrink-0 text-sm text-muted-foreground">{kind}</span>}

      {badge}
    </>
  );
  const rounding = action ? "rounded-tl-xl" : "rounded-t-xl";
  const trigger = target.href ? (
    <AppLink appearance="unstyled" className={cn(HEADER_TRIGGER, rounding)} draggable={false} href={target.href}>
      {content}
    </AppLink>
  ) : target.onClick ? (
    <button
      aria-label={label ?? name}
      className={cn(HEADER_TRIGGER, rounding)}
      disabled={target.disabled}
      type="button"
      onClick={target.onClick}
    >
      {content}
    </button>
  ) : (
    <div className="flex min-w-0 flex-1 items-center gap-2.5 px-3.5 pt-3 pb-2.5">{content}</div>
  );
  if (!action) return trigger;
  return (
    <div className="flex items-center gap-1 rounded-t-xl pe-2">
      {trigger}

      {action}
    </div>
  );
}

export function ConfigureNodeRows({
  label,
  lead = "none",
  children,
}: {
  label: string;
  lead?: RowLead;
  children: ReactNode;
}) {
  return (
    <RowLeadContext.Provider value={lead}>
      <ul aria-label={label} className="border-t border-border py-1">
        {children}
      </ul>
    </RowLeadContext.Provider>
  );
}

export function ConfigureNodeRow({
  marker,
  name,
  detail,
  kind,
  className,
  ...props
}: Omit<ComponentProps<"button">, "children"> & {
  marker?: ReactNode;
  name: ReactNode;
  detail?: ReactNode;
  kind: ReactNode;
}) {
  const lead = useContext(RowLeadContext);
  return (
    <button className={cn(ROW_BUTTON, className)} type="button" {...props}>
      {marker ?? (lead === "marker" && <span aria-hidden className="size-3.5 shrink-0" />)}

      <span className="min-w-0 flex-1 truncate">
        <span className="font-medium">{name}</span>

        {detail && <span className="text-muted-foreground"> {detail}</span>}
      </span>

      <span className="shrink-0 text-muted-foreground">{kind}</span>
    </button>
  );
}

export function ConfigureNodeMore({
  expanded,
  label,
  onToggle,
  ...props
}: Omit<ComponentProps<"button">, "children" | "onClick"> & {
  expanded: boolean;
  label: string;
  onToggle: () => void;
}) {
  const lead = useContext(RowLeadContext);
  return (
    <li>
      <button
        aria-expanded={expanded}
        className={cn(
          "nodrag flex h-9 w-full items-center px-3.5 text-left text-sm text-muted-foreground outline-none hover:bg-accent/50 hover:text-foreground focus-visible:bg-accent/60",
          MORE_INSET[lead],
        )}
        type="button"
        onClick={onToggle}
        {...props}
      >
        {label}
      </button>
    </li>
  );
}

export function ConfigureNodeFooter({ children }: { children: ReactNode }) {
  return <div className="border-t border-border px-3.5 py-2 text-sm text-muted-foreground">{children}</div>;
}

export function ConfigureNodeCount({ count, unit }: { count: number; unit: string }) {
  const intlStore = useHydratedIntlStore();
  return (
    <span className="flex items-baseline gap-1">
      <span className="text-base font-semibold text-foreground tabular-nums">{intlStore.formatNumber(count)}</span>

      <span>{unit}</span>
    </span>
  );
}
