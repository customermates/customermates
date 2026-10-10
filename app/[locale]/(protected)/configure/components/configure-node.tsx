"use client";

import type { ComponentProps, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import { AppLink } from "@/components/shared/app-link";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { cn } from "@/core/utils/cn";

const HEADER_TRIGGER =
  "flex min-w-0 flex-1 items-center gap-2.5 px-3.5 pt-3 pb-2.5 text-left outline-none hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset disabled:pointer-events-none";

const ROW_LAYOUT = "flex h-9 w-full items-center gap-2.5 px-3.5 text-left text-sm";

const NAME_INSET = "ps-10";

const ROW_BUTTON = "nodrag outline-none hover:bg-accent/50 focus-visible:bg-accent/60 disabled:pointer-events-none";

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

export function ConfigureNodeRows({ label, children }: { label: string; children: ReactNode }) {
  return (
    <ul aria-label={label} className="border-t border-border py-1">
      {children}
    </ul>
  );
}

type RowContent = { marker?: ReactNode; name: ReactNode; detail?: ReactNode; kind: ReactNode };

function ConfigureNodeRowContent({ marker, name, detail, kind }: RowContent) {
  return (
    <>
      <span aria-hidden className="flex size-4 shrink-0 items-center justify-center">
        {marker}
      </span>

      <span className="min-w-0 flex-1 truncate">
        <span className="font-medium">{name}</span>

        {detail && <span className="text-muted-foreground"> {detail}</span>}
      </span>

      <span className="shrink-0 text-muted-foreground">{kind}</span>
    </>
  );
}

export function ConfigureNodeRow({
  marker,
  name,
  detail,
  kind,
  className,
  ...props
}: Omit<ComponentProps<"button">, "children"> & RowContent) {
  return (
    <button className={cn(ROW_LAYOUT, ROW_BUTTON, className)} type="button" {...props}>
      <ConfigureNodeRowContent detail={detail} kind={kind} marker={marker} name={name} />
    </button>
  );
}

export function ConfigureNodeStaticRow({
  marker,
  name,
  detail,
  kind,
  className,
  ...props
}: Omit<ComponentProps<"div">, "children"> & RowContent) {
  return (
    <div className={cn(ROW_LAYOUT, className)} {...props}>
      <ConfigureNodeRowContent detail={detail} kind={kind} marker={marker} name={name} />
    </div>
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
  return (
    <li>
      <button
        aria-expanded={expanded}
        className={cn(
          "nodrag flex h-9 w-full items-center px-3.5 text-left text-sm text-muted-foreground outline-none hover:bg-accent/50 hover:text-foreground focus-visible:bg-accent/60",
          NAME_INSET,
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
  return (
    <div className={cn("border-t border-border py-2 pe-3.5 text-sm text-muted-foreground", NAME_INSET)}>{children}</div>
  );
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
