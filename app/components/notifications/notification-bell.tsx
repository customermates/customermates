"use client";

import { Bell } from "lucide-react";
import { useCallback, useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import type { NotificationDto } from "@/features/notifications/notification.schema";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { reportApplicationError } from "@/core/errors/report-application-error";
import { actionDataOrNull } from "@/core/utils/action-data";
import { cn } from "@/core/utils/cn";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { IntlLink } from "@/i18n/navigation";

import { getNotificationsAction, markNotificationsReadAction } from "./notification-actions";

const POLL_INTERVAL_MS = 60_000;
const PAGE_SIZE = 20;

export function NotificationBell() {
  const t = useTranslations();
  const intlStore = useHydratedIntlStore();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationDto[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [pending, startTransition] = useTransition();

  const refresh = useCallback(async () => {
    const inbox = await actionDataOrNull(getNotificationsAction({ limit: PAGE_SIZE }));
    if (!inbox) return;
    setItems(inbox.items);
    setUnreadCount(inbox.unreadCount);
    setLoaded(true);
  }, []);

  useEffect(() => {
    void refresh().catch(reportApplicationError);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh().catch(reportApplicationError);
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    if (open) void refresh().catch(reportApplicationError);
  }, [open, refresh]);

  const markRead = (ids: string[] | null) =>
    startTransition(async () => {
      const unread = ids ?? items.filter((item) => !item.read).map((item) => item.id);
      if (unread.length === 0) return;
      await markNotificationsReadAction(ids ? { ids } : { all: true });
      await refresh();
    });

  const label = unreadCount > 0 ? t("Notifications.openUnread", { count: unreadCount }) : t("Notifications.open");

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button aria-label={label} className="relative" size="icon" variant="ghost">
              <Bell aria-hidden="true" className="size-4" />

              {unreadCount > 0 && (
                <span
                  aria-hidden="true"
                  className="absolute -end-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-4 text-primary-foreground"
                >
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>

        <TooltipContent>{t("Notifications.title")}</TooltipContent>
      </Tooltip>

      <PopoverContent align="end" className="w-96 max-w-[calc(100vw-2rem)] p-0">
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">{t("Notifications.title")}</h2>

          <Button disabled={pending || unreadCount === 0} size="sm" variant="ghost" onClick={() => markRead(null)}>
            {t("Notifications.markAllRead")}
          </Button>
        </div>

        {!loaded || items.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            {loaded ? t("Notifications.empty") : t("Notifications.loading")}
          </p>
        ) : (
          <ul className="max-h-96 divide-y divide-border overflow-y-auto">
            {items.map((item) => {
              const content = (
                <>
                  <span className="flex items-start justify-between gap-2">
                    <span className={cn("text-sm", !item.read && "font-semibold")}>{item.title}</span>

                    {!item.read && (
                      <span
                        aria-label={t("Notifications.unread")}
                        className="mt-1.5 size-2 shrink-0 rounded-full bg-primary"
                      />
                    )}
                  </span>

                  {item.body && <span className="line-clamp-2 text-xs text-muted-foreground">{item.body}</span>}

                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{t(`Notifications.kinds.${item.kind}`)}</span>

                    <span aria-hidden="true">·</span>

                    <span>{intlStore.formatRelativeTime(new Date(item.createdAt))}</span>
                  </span>
                </>
              );
              const className =
                "flex w-full flex-col gap-1 px-4 py-3 text-start hover:bg-accent focus-visible:bg-accent";

              return (
                <li key={item.id}>
                  {item.href ? (
                    <IntlLink
                      className={className}
                      href={item.href}
                      onClick={() => {
                        setOpen(false);
                        if (!item.read) markRead([item.id]);
                      }}
                    >
                      {content}
                    </IntlLink>
                  ) : (
                    <button className={className} type="button" onClick={() => !item.read && markRead([item.id])}>
                      {content}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
