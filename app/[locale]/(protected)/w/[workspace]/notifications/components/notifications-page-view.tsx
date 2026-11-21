"use client";

import { Bell, CheckCheck, Settings } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import type { NotificationInbox } from "@/features/notifications/notification.schema";

import { useSetTopBarActions } from "@/app/components/topbar-actions-context";
import { NOTIFICATION_PREFERENCES_HREF } from "@/app/components/notifications/notification-links";
import { NotificationRow } from "@/app/components/notifications/notification-row";
import { PageState } from "@/components/page-state/page-state";
import { TopBarActionButtons } from "@/components/shared/top-bar-action-buttons";
import { serverRenderedClient } from "@/core/utils/server-rendered-client";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { reportApplicationError, runUserAction } from "@/core/errors/report-application-error";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { startBackgroundPoll } from "@/core/utils/background-poll";

import {
  filterNotificationsForPage,
  groupNotificationsByAge,
  NOTIFICATION_PAGE_FILTERS,
  type NotificationPageFilter,
} from "./notifications-page-model";
import { NotificationsPageSkeleton } from "./notifications-page-skeleton";

const REFRESH_INTERVAL_MS = 30_000;

type Props = { initialInbox: NotificationInbox };

const NotificationsPageViewContent = observer(function NotificationsPageView({ initialInbox }: Props) {
  const t = useTranslations();
  const intlStore = useHydratedIntlStore();
  const { notificationsStore: store } = useRootStore();
  const [filter, setFilter] = useState<NotificationPageFilter>("all");
  const appliedInbox = useRef<NotificationInbox | null>(null);

  if (appliedInbox.current !== initialInbox) {
    appliedInbox.current = initialInbox;
    store.hydrate(initialInbox);
  }

  useEffect(
    () =>
      startBackgroundPoll({
        refresh: store.refreshNewest,
        onError: reportApplicationError,
        intervalMs: REFRESH_INTERVAL_MS,
      }),
    [store],
  );

  const unreadCount = store.unreadCount ?? 0;
  const canMarkAll = unreadCount > 0 && !store.isMarking;
  const topBar = useMemo(
    () => (
      <TopBarActionButtons
        actions={[
          {
            id: "notifications-mark-all-read",
            anchorId: "notifications-mark-all-read",
            icon: CheckCheck,
            label: t("Notifications.markAllRead"),
            disabled: !canMarkAll,
            onClick: store.markAllRead,
          },
          {
            id: "notifications-settings",
            anchorId: "notifications-settings",
            icon: Settings,
            label: t("Notifications.settings"),
            href: NOTIFICATION_PREFERENCES_HREF,
          },
        ]}
      />
    ),
    [canMarkAll, store, t],
  );
  useSetTopBarActions(topBar);

  if (store.items.length === 0 && store.nextBefore === null) {
    return (
      <PageState
        background={<NotificationsPageSkeleton animated={false} />}
        description={t("Notifications.emptyDescription")}
        icon={Bell}
        state="empty"
        title={t("Notifications.empty")}
      />
    );
  }

  const visible = filterNotificationsForPage(store.items, filter);
  const sections = intlStore.rendersZonedValues
    ? groupNotificationsByAge(visible, new Date())
    : [{ group: null, items: visible }];
  const markRead = (id: string) => runUserAction(() => store.markRead([id]));

  return (
    <div className="flex w-full flex-col pb-6">
      <div className="border-b border-border bg-background px-4 pt-1 pb-4" data-joins-top-bar="">
        <SegmentedControl
          className="w-full sm:w-fit"
          items={NOTIFICATION_PAGE_FILTERS.map((option) => ({
            value: option,
            label: t(`Notifications.pageFilters.${option}`),
          }))}
          label={t("Notifications.filtersLabel")}
          listClassName="[&>button]:px-1.5 [&>button]:text-xs sm:[&>button]:px-3 sm:[&>button]:text-sm"
          value={filter}
          onValueChange={setFilter}
        />
      </div>

      {visible.length === 0 ? (
        <p className="px-4 py-10 text-sm text-muted-foreground">
          {filter === "unread" ? t("Notifications.emptyUnread") : t("Notifications.emptyFiltered")}
        </p>
      ) : (
        sections.map((section) => (
          <section key={section.group ?? "all"}>
            {section.group && (
              <h2 className="sticky top-0 z-10 border-b border-border bg-background/95 px-4 py-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase backdrop-blur">
                {t(`Notifications.groups.${section.group}`)}
              </h2>
            )}

            <ul>
              {section.items.map((item) => (
                <li key={item.id}>
                  <NotificationRow
                    item={item}
                    time={intlStore.formatRelativeTime(new Date(item.createdAt))}
                    onMarkRead={markRead}
                  />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      {store.nextBefore && (
        <div className="flex px-4 pt-4">
          <Button
            disabled={store.isLoadingMore}
            size="sm"
            variant="secondary"
            onClick={() => runUserAction(store.loadMore)}
          >
            {t("Common.actions.loadMore")}
          </Button>
        </div>
      )}
    </div>
  );
});

export const NotificationsPageView = serverRenderedClient(NotificationsPageViewContent);
