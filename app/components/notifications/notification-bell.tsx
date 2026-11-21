"use client";

import { Bell } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useSidebar } from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useRootStore } from "@/core/stores/root-store.provider";
import { cn } from "@/core/utils/cn";
import { NOTIFICATIONS_PATH } from "@/features/notifications/notification.schema";
import { IntlLink } from "@/i18n/navigation";

import { NOTIFICATION_PREFERENCES_HREF } from "./notification-links";
import { NotificationsPanel } from "./notifications-panel";

function BellIcon({ unread, ringClassName }: { unread: boolean; ringClassName: string }) {
  return (
    <span className="relative inline-flex">
      <Bell aria-hidden className="size-4" />

      {unread && (
        <span
          aria-hidden
          className={cn("absolute -top-0.5 -right-0.5 size-2 rounded-full bg-destructive ring-2", ringClassName)}
          data-notification-bell-dot=""
        />
      )}
    </span>
  );
}

export const NotificationBell = observer(function NotificationBell() {
  const t = useTranslations();
  const { isMobile, setOpenMobile } = useSidebar();
  const { notificationsStore: store } = useRootStore();
  const [open, setOpen] = useState(false);
  const unreadCount = store.unreadCount ?? 0;
  const label =
    unreadCount > 0 ? t("Notifications.bellLabelUnread", { count: unreadCount }) : t("NavigationBar.notifications");

  const triggerClassName =
    "size-8 shrink-0 text-sidebar-foreground hover:bg-sidebar-accent data-[state=open]:bg-sidebar-accent group-data-[collapsible=icon]:hidden";

  if (isMobile) {
    return (
      <Button asChild aria-label={label} className={triggerClassName} size="icon-sm" variant="ghost">
        <IntlLink href={NOTIFICATIONS_PATH} id="nav-notifications" onClick={() => setOpenMobile(false)}>
          <BellIcon ringClassName="ring-sidebar" unread={unreadCount > 0} />
        </IntlLink>
      </Button>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              aria-label={label}
              className={triggerClassName}
              id="nav-notifications"
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <BellIcon ringClassName="ring-sidebar" unread={unreadCount > 0} />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>

        <TooltipContent>{label}</TooltipContent>
      </Tooltip>

      <PopoverContent align="start" className="w-[380px] overflow-hidden p-0" side="bottom" sideOffset={6}>
        <NotificationsPanel
          settingsHref={NOTIFICATION_PREFERENCES_HREF}
          store={store}
          onNavigate={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  );
});
