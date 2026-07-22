"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import type { MessagingProvider } from "@/generated/prisma";

import { Pencil, Plus, Trash2 } from "lucide-react";

import { Avatar } from "@/components/ui/avatar";
import { AppCardHeader } from "@/components/card/app-card-header";
import { auditEventTone } from "@/components/entity-detail/audit-event-tone";
import { getProviderIcon } from "@/ee/messaging/provider-icon";
import { cn } from "@/core/utils/cn";

const BADGE_BASE =
  "ring-background bg-background absolute -right-px -bottom-px size-3.5 overflow-hidden rounded-full ring-2";

export type BadgeTone = "created" | "updated" | "deleted" | "received" | "sent" | "calendar" | "activity";

const BADGE_TONE: Record<BadgeTone, string> = {
  created: "border-success/30 bg-success/20 text-success",
  updated: "border-primary/30 bg-primary/20 text-primary",
  deleted: "border-destructive/30 bg-destructive/20 text-destructive",
  received: "border-foreground/15 bg-foreground/5 text-foreground/80 dark:bg-foreground/10",
  sent: "border-primary/30 bg-primary/20 text-primary",
  calendar: "border-warning/30 bg-warning/20 text-warning",
  activity: "border-info/30 bg-info/20 text-info",
};

export function TypeBadge({ icon: IconCmp, tone, label }: { icon: LucideIcon; tone: BadgeTone; label?: string }) {
  return (
    <span className={BADGE_BASE}>
      <span className={cn("flex size-full items-center justify-center rounded-full border", BADGE_TONE[tone])}>
        <IconCmp aria-label={label} className="size-2" />
      </span>
    </span>
  );
}

export function IdentityAvatar({
  name,
  src,
  badge,
}: {
  name: string | [string | null | undefined, string | null | undefined];
  src?: string | null;
  badge?: ReactNode;
}) {
  return (
    <div className="relative">
      <Avatar className="bg-background" name={name} size="lg" src={src} />

      {badge}
    </div>
  );
}

export function ProviderAvatar({
  provider,
  label,
  badge,
}: {
  provider: MessagingProvider;
  label: string;
  badge?: ReactNode;
}) {
  const ProviderIcon = getProviderIcon(provider);
  return (
    <div className="relative">
      <span className="bg-background flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg">
        <ProviderIcon aria-label={label} className="size-full" />
      </span>

      {badge}
    </div>
  );
}

export function DetailHeader({
  avatar,
  title,
  provider,
  providerLabel,
  subtitle,
  action,
}: {
  avatar: ReactNode;
  title: string;
  provider?: MessagingProvider;
  providerLabel?: string;
  subtitle: string;
  action?: ReactNode;
}) {
  const ProviderIcon = provider ? getProviderIcon(provider) : null;

  return (
    <AppCardHeader>
      {avatar}

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="min-w-0 truncate text-sm font-semibold">{title}</p>

          {ProviderIcon && (
            <ProviderIcon aria-label={providerLabel} className="text-muted-foreground size-3 shrink-0" />
          )}
        </div>

        <p className="text-muted-foreground text-xs">{subtitle}</p>
      </div>

      {action}
    </AppCardHeader>
  );
}

export function auditCategory(event: string): { icon: LucideIcon; tone: BadgeTone } {
  const tone = auditEventTone(event);
  if (tone === "deleted") return { icon: Trash2, tone: "deleted" };
  if (tone === "created") return { icon: Plus, tone: "created" };
  return { icon: Pencil, tone: "updated" };
}

type TimelineRowProps = {
  avatar: ReactNode;
  title: string;
  titleIcon?: ReactNode;
  subtitle: ReactNode;
  time: string;
  isFirst: boolean;
  isLast: boolean;
  onClick?: () => void;
};

export function TimelineRow({ avatar, title, titleIcon, subtitle, time, isFirst, isLast, onClick }: TimelineRowProps) {
  return (
    <li className="relative">
      {!isFirst && <span aria-hidden className="bg-border absolute left-[23.5px] top-0 h-[26px] w-px" />}

      {!isLast && <span aria-hidden className="bg-border absolute left-[23.5px] top-[26px] bottom-0 w-px" />}

      <button
        className={cn(
          "group relative flex w-full items-start gap-3 rounded-md p-2 text-left transition-colors focus-visible:outline-none",
          onClick ? "hover:bg-accent/40 focus-visible:bg-accent/40" : "cursor-default",
        )}
        type="button"
        onClick={onClick}
      >
        <div className="relative z-10 mt-0.5 shrink-0">{avatar}</div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
              <h3 className="min-w-0 truncate text-sm font-medium">{title}</h3>

              {titleIcon}
            </div>

            <time className="text-muted-foreground shrink-0 whitespace-nowrap text-xs">{time}</time>
          </div>

          {subtitle && <p className="text-muted-foreground mt-0.5 line-clamp-2 text-xs">{subtitle}</p>}
        </div>
      </button>
    </li>
  );
}
