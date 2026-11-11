"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import type { MessagingProvider } from "@/generated/prisma";
import type { ActivityRecordContextDto, SystemActorProcess } from "@/ee/messaging/activities/activities.schema";

import { Bot, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { Avatar } from "@/components/ui/avatar";
import { AppCardHeader } from "@/components/card/app-card-header";
import { auditEventTone } from "@/components/entity-detail/audit-event-tone";
import { getProviderIcon } from "@/ee/messaging/provider-icon";
import { cn } from "@/core/utils/cn";

import { ActivityRecordChips } from "./activity-record-chips";

const BADGE_BASE =
  "ring-background bg-background absolute -right-px -bottom-px size-3.5 overflow-hidden rounded-full ring-2";

type BadgeTone = "created" | "updated" | "deleted" | "received" | "sent" | "calendar" | "activity";

const BADGE_TONE: Record<BadgeTone, string> = {
  created: "border-success/30 bg-success/20 text-success-soft-foreground",
  updated: "border-primary/20 bg-primary/10 text-primary",
  deleted: "border-destructive/30 bg-destructive/20 text-destructive",
  received: "border-input bg-foreground/5 text-foreground/80",
  sent: "border-primary/20 bg-primary/10 text-primary",
  calendar: "border-warning/30 bg-warning/20 text-warning-soft-foreground",
  activity: "border-info/30 bg-info/20 text-info-soft-foreground",
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

const SYSTEM_ACTOR_ICONS: Record<SystemActorProcess, LucideIcon> = {
  messaging: RefreshCw,
  trash: Trash2,
  other: Bot,
};

export function IdentityAvatar({
  name,
  src,
  badge,
  size = "lg",
  system,
}: {
  name: string | [string | null | undefined, string | null | undefined];
  src?: string | null;
  badge?: ReactNode;
  size?: "lg" | "xl";
  system?: SystemActorProcess;
}) {
  const SystemIcon = system ? SYSTEM_ACTOR_ICONS[system] : null;
  return (
    <div className="relative">
      {SystemIcon ? (
        <Avatar
          className="bg-background"
          data-system-actor={system}
          fallback={<SystemIcon aria-hidden className={size === "xl" ? "size-7" : "size-4"} />}
          size={size}
        />
      ) : (
        <Avatar className="bg-background" name={name} size={size} src={src} />
      )}

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

function TitleSuffix({ children }: { children?: string }) {
  if (!children) return null;
  return <span className="text-muted-foreground font-normal"> {children}</span>;
}

export function DetailHeader({
  avatar,
  title,
  titleSuffix,
  provider,
  providerLabel,
  subtitle,
  subject,
  records,
}: {
  avatar: ReactNode;
  title: string;
  titleSuffix?: string;
  provider?: MessagingProvider;
  providerLabel?: string;
  subtitle: string;
  subject?: ReactNode;
  records?: ActivityRecordContextDto;
}) {
  const ProviderIcon = provider ? getProviderIcon(provider) : null;

  return (
    <AppCardHeader>
      {avatar}

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="min-w-0 truncate text-sm font-semibold">
            {title}

            <TitleSuffix>{titleSuffix}</TitleSuffix>
          </p>

          {ProviderIcon && (
            <ProviderIcon aria-label={providerLabel} className="text-muted-foreground size-3 shrink-0" />
          )}
        </div>

        <p className="text-muted-foreground text-xs">{subtitle}</p>

        {subject && <div className="mt-1.5">{subject}</div>}

        {records?.primary && (
          <div className="mt-1.5">
            <ActivityRecordChips context={records} />
          </div>
        )}
      </div>
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
  titleSuffix?: string;
  titleIcon?: ReactNode;
  subject?: string | null;
  subtitle: ReactNode;
  time: string;
  isFirst: boolean;
  isLast: boolean;
  onClick?: () => void;
};

export function TimelineRow({
  avatar,
  title,
  titleSuffix,
  titleIcon,
  subject,
  subtitle,
  time,
  isFirst,
  isLast,
  onClick,
}: TimelineRowProps) {
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
              <h3 className="min-w-0 truncate text-sm font-medium">
                {title}

                <TitleSuffix>{titleSuffix}</TitleSuffix>
              </h3>

              {titleIcon}
            </div>

            <time className="text-muted-foreground shrink-0 whitespace-nowrap text-xs">{time}</time>
          </div>

          {subtitle && (
            <p className="text-muted-foreground mt-0.5 line-clamp-2 text-xs">
              {subject && (
                <>
                  <span className="font-medium">{subject}</span>

                  <span aria-hidden> · </span>
                </>
              )}

              {subtitle}
            </p>
          )}
        </div>
      </button>
    </li>
  );
}

export function useActorViaLabel(): (actor: { via?: { name: string } }) => string | undefined {
  const t = useTranslations();
  return (actor) => (actor.via ? t("EntityTimeline.viaCredential", { name: actor.via.name }) : undefined);
}

export function useSystemActorLabel(): (process: SystemActorProcess) => string {
  const t = useTranslations();
  const labels: Record<SystemActorProcess, string> = {
    messaging: t("RecordModel.systemActors.messaging"),
    trash: t("RecordModel.systemActors.trash"),
    other: t("RecordModel.systemActors.other"),
  };
  return (process) => labels[process];
}
