"use client";

import { ArrowRight, CheckCheck, Settings } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import type { NotificationsStore } from "@/app/[locale]/(protected)/w/[workspace]/notifications/components/notifications.store";

import {
  panelNotifications,
  type NotificationPanelFilter,
} from "@/app/[locale]/(protected)/w/[workspace]/notifications/components/notifications-page-model";
import { SkeletonShape } from "@/components/page-state/skeleton-shape";
import { IconButton } from "@/components/ui/icon-button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { reportApplicationError, runUserAction } from "@/core/errors/report-application-error";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { startBackgroundPoll } from "@/core/utils/background-poll";
import { NOTIFICATIONS_PATH } from "@/features/notifications/notification.schema";
import { IntlLink, useRouter } from "@/i18n/navigation";

import { NotificationRow } from "./notification-row";

const PANEL_REFRESH_INTERVAL_MS = 30_000;
const SKELETON_ROWS = [0, 1, 2];

type Props = {
  store: NotificationsStore;
  settingsHref: string;
  onNavigate: () => void;
};

export const NotificationsPanel = observer(function NotificationsPanel({ store, settingsHref, onNavigate }: Props) {
  const t = useTranslations();
  const intlStore = useHydratedIntlStore();
  const router = useRouter();
  const [filter, setFilter] = useState<NotificationPanelFilter>(() =>
    (store.unreadCount ?? 0) > 0 ? "unread" : "all",
  );

  useEffect(
    () =>
      startBackgroundPoll({
        refresh: store.refreshNewest,
        onError: reportApplicationError,
        intervalMs: PANEL_REFRESH_INTERVAL_MS,
        immediate: true,
      }),
    [store],
  );

  const unreadCount = store.unreadCount ?? 0;
  const visible = panelNotifications(store.items, filter);
  const markRead = (id: string) => runUserAction(() => store.markRead([id]));

  return (
    <div
      className="flex max-h-[min(36rem,var(--radix-popover-content-available-height))] flex-col"
      data-notifications-panel=""
    >
      <div className="flex items-center justify-between gap-2 px-4 pt-3">
        <h2 className="text-sm font-semibold">{t("NavigationBar.notifications")}</h2>

        <div className="flex items-center gap-1">
          <IconButton
            className="size-7 rounded-md hover:bg-accent"
            disabled={unreadCount === 0 || store.isMarking}
            icon={CheckCheck}
            iconClassName="size-4"
            label={t("Notifications.markAllRead")}
            onClick={() => runUserAction(store.markAllRead)}
          />

          <IconButton
            className="size-7 rounded-md hover:bg-accent"
            icon={Settings}
            iconClassName="size-4"
            label={t("Notifications.settings")}
            onClick={() => {
              onNavigate();
              router.push(settingsHref);
            }}
          />
        </div>
      </div>

      <div className="px-4 pt-2 pb-3">
        <SegmentedControl
          className="w-fit"
          items={[
            {
              value: "unread",
              label: (
                <>
                  {t("Notifications.pageFilters.unread")}

                  {unreadCount > 0 && <span className="ms-1.5 tabular-nums">{unreadCount}</span>}
                </>
              ),
            },
            { value: "all", label: t("Notifications.pageFilters.all") },
          ]}
          label={t("Notifications.panelFilterLabel")}
          value={filter}
          onValueChange={setFilter}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto border-t border-border">
        {!store.hasLoaded ? (
          SKELETON_ROWS.map((row) => (
            <div key={row} className="flex items-start gap-3 border-b border-border px-4 py-3">
              <SkeletonShape animated className="size-8 shrink-0 rounded-lg" />

              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <SkeletonShape animated className="h-3.5 w-3/5" />

                <SkeletonShape animated className="h-3 w-4/5" />
              </div>
            </div>
          ))
        ) : visible.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground" data-notifications-panel-empty="">
            {filter === "unread" ? t("Notifications.emptyUnread") : t("Notifications.empty")}
          </p>
        ) : (
          <ul className="[&>li:last-child>div]:border-b-0">
            {visible.map((item) => (
              <li key={item.id}>
                <NotificationRow
                  item={item}
                  time={intlStore.formatRelativeTime(new Date(item.createdAt))}
                  onMarkRead={markRead}
                  onOpen={onNavigate}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-t border-border px-4 py-2.5">
        <IntlLink
          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:text-foreground"
          href={NOTIFICATIONS_PATH}
          id="notifications-panel-see-all"
          onClick={onNavigate}
        >
          {t("Notifications.seeAll")}

          <ArrowRight aria-hidden className="size-3.5" />
        </IntlLink>
      </div>
    </div>
  );
});
