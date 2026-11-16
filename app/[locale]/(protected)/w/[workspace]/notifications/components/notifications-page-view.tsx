"use client";

import { Bell, CheckCheck } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import type { HydrationSafeIntlStore } from "@/core/stores/use-hydrated-intl-store";
import type { NotificationDto, NotificationInbox } from "@/features/notifications/notification.schema";
import type { NotificationsStore } from "./notifications.store";

import { useSetTopBarActions } from "@/app/components/topbar-actions-context";
import { PageState } from "@/components/page-state/page-state";
import { TopBarActionButtons } from "@/components/shared/top-bar-action-buttons";
import { Button } from "@/components/ui/button";
import { reportApplicationError, runUserAction } from "@/core/errors/report-application-error";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { cn } from "@/core/utils/cn";
import { startBackgroundPoll } from "@/core/utils/background-poll";
import { IntlLink } from "@/i18n/navigation";

import {
  filterNotificationsByKind,
  groupNotificationsByDay,
  isListedNotificationKind,
  NOTIFICATION_KIND_FILTERS,
  resolveNotificationDayLabel,
  type NotificationKindFilter,
} from "./notifications-page-model";
import { NotificationsPageSkeleton } from "./notifications-page-skeleton";

const REFRESH_INTERVAL_MS = 30_000;

type Props = { initialInbox: NotificationInbox };

type RowProps = {
  item: NotificationDto;
  intlStore: HydrationSafeIntlStore;
  store: NotificationsStore;
};

function NotificationRow({ item, intlStore, store }: RowProps) {
  const t = useTranslations();
  const content = (
    <>
      <span aria-hidden={item.read || undefined} className="flex h-5 w-2 shrink-0 items-center">
        {!item.read && (
          <span aria-label={t("Notifications.unread")} className="size-2 rounded-full bg-primary" role="img" />
        )}
      </span>

      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-start justify-between gap-3">
          <span className={cn("min-w-0 text-sm", item.read ? "text-foreground" : "font-semibold")}>{item.title}</span>

          <span className="shrink-0 text-xs text-muted-foreground">
            {intlStore.formatRelativeTime(new Date(item.createdAt))}
          </span>
        </span>

        {item.body && <span className="line-clamp-2 text-xs text-muted-foreground">{item.body}</span>}

        {isListedNotificationKind(item.kind) && (
          <span className="text-xs text-muted-foreground">{t(`Notifications.kinds.${item.kind}`)}</span>
        )}
      </span>
    </>
  );
  const className =
    "flex w-full items-start gap-3 border-b border-border px-4 py-3 text-start hover:bg-accent focus-visible:bg-accent md:px-6";
  const markRead = () => {
    if (!item.read) runUserAction(() => store.markRead([item.id]));
  };

  return item.href ? (
    <IntlLink className={className} href={item.href} onClick={markRead}>
      {content}
    </IntlLink>
  ) : (
    <button className={className} type="button" onClick={markRead}>
      {content}
    </button>
  );
}

export const NotificationsPageView = observer(function NotificationsPageView({ initialInbox }: Props) {
  const t = useTranslations();
  const intlStore = useHydratedIntlStore();
  const { notificationsStore: store } = useRootStore();
  const [kind, setKind] = useState<NotificationKindFilter>("all");
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

  const visible = filterNotificationsByKind(store.items, kind);
  const now = new Date();
  const groups = intlStore.rendersZonedValues
    ? groupNotificationsByDay(visible)
    : [{ key: "all", date: now, items: visible }];

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col pb-6">
      <div
        aria-label={t("Notifications.filtersLabel")}
        className="flex flex-wrap gap-2 px-4 pt-4 pb-3 md:px-6"
        role="group"
      >
        {NOTIFICATION_KIND_FILTERS.map((option) => (
          <Button
            key={option}
            aria-pressed={kind === option}
            className="rounded-full"
            size="sm"
            type="button"
            variant={kind === option ? "default" : "secondary"}
            onClick={() => setKind(option)}
          >
            {option === "all" ? t("Notifications.filterAll") : t(`Notifications.kinds.${option}`)}
          </Button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground md:px-6">
          {t("Notifications.emptyFiltered")}
        </p>
      ) : (
        groups.map((group) => (
          <section key={group.key}>
            {intlStore.rendersZonedValues && (
              <h2 className="sticky top-0 z-10 border-b border-border bg-background/95 px-4 py-2 text-xs font-medium text-muted-foreground backdrop-blur md:px-6">
                {resolveNotificationDayLabel(
                  group.date,
                  now,
                  { today: t("Notifications.dayToday"), yesterday: t("Notifications.dayYesterday") },
                  (date) => intlStore.formatDescriptiveShortDate(date),
                )}
              </h2>
            )}

            <ul>
              {group.items.map((item) => (
                <li key={item.id}>
                  <NotificationRow intlStore={intlStore} item={item} store={store} />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      {store.nextBefore && (
        <div className="flex justify-center px-4 pt-4">
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
