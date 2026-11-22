"use client";

import type { NotificationDto } from "@/features/notifications/notification.schema";

import { Check } from "lucide-react";
import { useTranslations } from "next-intl";

import { IconButton } from "@/components/ui/icon-button";
import { cn } from "@/core/utils/cn";
import { IntlLink } from "@/i18n/navigation";

import { notificationKindVisual } from "./notification-kind-visual";

type Props = {
  item: NotificationDto;
  time: string;
  onMarkRead: (id: string) => void;
  onOpen?: () => void;
};

export function NotificationRow({ item, time, onMarkRead, onOpen }: Props) {
  const t = useTranslations();
  const { icon: KindIcon, tone } = notificationKindVisual(item);
  const markRead = () => {
    if (!item.read) onMarkRead(item.id);
  };
  const open = () => {
    markRead();
    onOpen?.();
  };
  const content = (
    <>
      <span aria-hidden={item.read || undefined} className="flex h-8 w-2 shrink-0 items-center">
        {!item.read && (
          <span aria-label={t("Notifications.unread")} className="size-2 rounded-full bg-info" role="img" />
        )}
      </span>

      <span aria-hidden className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", tone)}>
        <KindIcon className="size-4" />
      </span>

      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-start justify-between gap-3">
          <span className={cn("min-w-0 text-sm", item.read ? "text-foreground" : "font-semibold")}>{item.title}</span>

          <span className="shrink-0 pt-0.5 text-xs whitespace-nowrap text-muted-foreground">{time}</span>
        </span>

        {item.body && <span className="truncate text-xs text-muted-foreground">{item.body}</span>}
      </span>
    </>
  );
  const mainClassName = "flex min-w-0 flex-1 items-start gap-3 py-3 ps-2 text-start outline-none";

  return (
    <div
      className={cn(
        "group flex items-start border-b border-border transition-colors hover:bg-accent has-[:focus-visible]:bg-accent",
        !item.read && "bg-muted/50",
      )}
      data-notification-row={item.id}
      data-unread={item.read ? undefined : ""}
    >
      {item.href ? (
        <IntlLink className={mainClassName} data-notification-open="" href={item.href} onClick={open}>
          {content}
        </IntlLink>
      ) : (
        <button className={mainClassName} data-notification-open="" type="button" onClick={open}>
          {content}
        </button>
      )}

      <span className="flex w-10 shrink-0 justify-center pt-3.5 pe-1">
        {!item.read && (
          <IconButton
            className="size-6 rounded-md opacity-0 group-hover:opacity-100 hover:bg-background focus-visible:opacity-100 pointer-coarse:opacity-100"
            icon={Check}
            iconClassName="size-3.5"
            label={t("Notifications.markRead")}
            onClick={markRead}
          />
        )}
      </span>
    </div>
  );
}
