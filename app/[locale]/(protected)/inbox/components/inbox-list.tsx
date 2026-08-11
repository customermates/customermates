"use client";

import type { MessagingThread } from "@/ee/messaging/messaging.schema";
import type { GetResult } from "@/core/base/base-get.interactor";
import type { DataViewRequestState } from "@/core/base/base-data-view.store";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { Cable, RefreshCw } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { IntlLink as Link, useRouter, usePathname } from "@/i18n/navigation";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";

import { cn } from "@/core/utils/cn";
import { Button } from "@/components/ui/button";
import { useDataViewSync } from "@/components/data-view";
import { DataViewToolbar } from "@/components/data-view/data-view-toolbar";
import { DataViewActiveFiltersBar } from "@/components/data-view/header/active-filters-bar";
import { DataViewPagination } from "@/components/data-view/header/pagination";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useSetTopBarActions } from "@/app/components/topbar-actions-context";
import { PageState } from "@/components/page-state/page-state";
import { DataViewEmptyState } from "@/components/data-view/data-view-empty-state";
import { resolveDataViewPageState } from "@/components/data-view/data-view-state";
import { PageSkeleton } from "@/components/page-state/page-skeleton";

import { ThreadRow } from "./thread-row";

type Props = {
  canConnect: boolean;
  threads: GetResult<MessagingThread>;
  selectedThreadId: string | null;
  locked?: boolean;
};

let didAutoScrollToThread = false;
let savedListScrollTop = 0;

export const InboxList = observer(({ canConnect, threads, selectedThreadId, locked = false }: Props) => {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { messagingThreadsStore, connectedAccountsStore } = useRootStore();

  useDataViewSync(messagingThreadsStore, threads);

  useEffect(() => {
    void connectedAccountsStore.ensureLoaded().catch(() => toast.error(t("Common.notifications.unexpectedError")));
  }, [connectedAccountsStore, t]);
  const channelsNeedingAction = connectedAccountsStore.needsActionCount;

  const isRefreshing = messagingThreadsStore.isRefreshing || messagingThreadsStore.isRefreshingInbox;
  const items = messagingThreadsStore.isReady ? messagingThreadsStore.items : threads.items;
  const pagination = messagingThreadsStore.isReady ? messagingThreadsStore.pagination : threads.pagination;
  const searchTerm = messagingThreadsStore.isReady ? messagingThreadsStore.searchTerm : threads.searchTerm;
  const filters = messagingThreadsStore.isReady ? messagingThreadsStore.filters : threads.filters;
  const hasActiveQuery = Boolean(searchTerm?.trim()) || (filters?.length ?? 0) > 0;
  const request: DataViewRequestState = isRefreshing
    ? { status: "refreshing" }
    : messagingThreadsStore.isReady
      ? messagingThreadsStore.dataRequest.status === "refresh-error"
        ? { status: "ready" }
        : messagingThreadsStore.dataRequest
      : { status: "ready" };
  const pageState = resolveDataViewPageState({
    explicitlyUnpaginated: pagination === undefined,
    hasActiveQuery,
    itemCount: items.length,
    request,
    total: pagination?.total,
  });
  const searchPlaceholder = t("Common.table.search");
  const topBarNode = useMemo(
    () =>
      locked ? null : (
        <div className="flex items-center gap-1">
          <DataViewToolbar
            isSearchable
            searchPlaceholder={searchPlaceholder}
            showDisplayOptions={false}
            store={messagingThreadsStore}
          />

          <Button
            aria-label={t("Inbox.refresh")}
            className="h-8"
            disabled={isRefreshing}
            size="sm"
            variant="secondary"
            onClick={() => void messagingThreadsStore.refreshInbox()}
          >
            <RefreshCw className={cn("size-3.5", isRefreshing && "animate-spin")} />

            <span className="hidden sm:inline">{t("Inbox.refresh")}</span>
          </Button>

          {canConnect && (
            <Button asChild className="h-8" size="sm" variant="default">
              <Link aria-label={t("ConnectedAccountsCard.title")} href="/profile/connected-accounts">
                <Cable className="size-3.5" />

                <span className="hidden sm:inline">{t("ConnectedAccountsCard.title")}</span>

                {channelsNeedingAction > 0 && (
                  <span className="bg-warning/25 text-warning inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-md px-1.5 text-[11px] font-medium tabular-nums">
                    {channelsNeedingAction}
                  </span>
                )}
              </Link>
            </Button>
          )}
        </div>
      ),
    [isRefreshing, messagingThreadsStore, searchPlaceholder, t, channelsNeedingAction, canConnect, locked],
  );
  useSetTopBarActions(topBarNode);

  function selectThread(threadId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("threadId", threadId);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function clearSelectedThread() {
    if (!selectedThreadId) return;

    const params = new URLSearchParams(searchParams.toString());
    params.delete("threadId");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  }

  const listRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;

    if (didAutoScrollToThread) el.scrollTop = savedListScrollTop;

    const save = () => {
      savedListScrollTop = el.scrollTop;
    };
    el.addEventListener("scroll", save, { passive: true });
    return () => el.removeEventListener("scroll", save);
  }, []);

  useEffect(() => {
    if (didAutoScrollToThread || items.length === 0) return;
    didAutoScrollToThread = true;
    if (!selectedThreadId) return;

    const row = listRef.current?.querySelector<HTMLElement>(`[data-thread-id="${selectedThreadId}"]`);
    requestAnimationFrame(() => row?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, [items.length, selectedThreadId]);

  return (
    <div className="flex h-full flex-col">
      <DataViewActiveFiltersBar store={messagingThreadsStore} onEditFilters={clearSelectedThread} />

      <div
        ref={listRef}
        className={cn(
          "flex-1 overflow-y-auto",
          pageState === "content" && "animate-page-result-in motion-reduce:animate-none",
        )}
        id="inbox-thread-list"
      >
        {locked ? (
          <PageSkeleton animated={false} spec={{ kind: "inbox", view: "list" }} />
        ) : pageState === "loading" ? (
          <PageState
            className="h-full"
            label={t("PageState.loading")}
            skeleton={{ kind: "inbox", view: "list" }}
            state="loading"
          />
        ) : pageState === "filtered-empty" ? (
          <DataViewEmptyState
            body={t("Common.emptyState.genericFilteredBody")}
            secondaryAction={{
              label: t("Common.emptyState.clearFilters"),
              onClick: () =>
                messagingThreadsStore.setQueryOptions({
                  filters: [],
                  searchTerm: "",
                }),
            }}
            title={t("Common.emptyState.filteredTitle")}
          />
        ) : pageState === "true-empty" ? (
          <PageState
            action={
              canConnect ? (
                <Button asChild size="sm" variant="secondary">
                  <Link href="/profile/connected-accounts">
                    <Cable className="size-3.5" />

                    {t("ConnectedAccountsCard.title")}
                  </Link>
                </Button>
              ) : undefined
            }
            className="h-full"
            description={t("Inbox.emptyState")}
            icon={Cable}
            skeleton={{ kind: "inbox", view: "list" }}
            state="empty"
            title={t("Common.emptyState.genericTitle")}
          />
        ) : (
          items.map((thread) => (
            <ThreadRow
              key={thread.id}
              selected={thread.id === selectedThreadId}
              thread={thread}
              onClick={() => selectThread(thread.id)}
            />
          ))
        )}
      </div>

      {pageState === "content" && <DataViewPagination store={messagingThreadsStore} />}
    </div>
  );
});
