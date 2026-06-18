"use client";

import type { MessagingThread } from "@/ee/messaging/messaging.schema";
import type { GetResult } from "@/core/base/base-get.interactor";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { Inbox } from "lucide-react";
import { useSearchParams } from "next/navigation";

import { IntlLink as Link, useRouter, usePathname } from "@/i18n/navigation";
import { useMemo } from "react";

import { Button } from "@/components/ui/button";
import { useDataViewSync } from "@/components/data-view";
import { DataViewToolbar } from "@/components/data-view/data-view-toolbar";
import { DataViewActiveFiltersBar } from "@/components/data-view/header/active-filters-bar";
import { DataViewPagination } from "@/components/data-view/header/pagination";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useSetTopBarActions } from "@/app/components/topbar-actions-context";

import { ThreadRow } from "./thread-row";

type Props = {
  threads: GetResult<MessagingThread>;
  selectedThreadId: string | null;
};

export const InboxList = observer(({ threads, selectedThreadId }: Props) => {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { messagingThreadsStore } = useRootStore();

  useDataViewSync(messagingThreadsStore, threads);

  const searchPlaceholder = t("Common.table.search");
  const topBarNode = useMemo(
    () => (
      <div className="flex items-center gap-2">
        <DataViewToolbar
          isSearchable
          searchPlaceholder={searchPlaceholder}
          showDisplayOptions={false}
          store={messagingThreadsStore}
        />

        <Button asChild className="h-8" size="sm">
          <Link href="/profile/connected-accounts">
            <span>{t("ConnectedAccountsCard.title")}</span>
          </Link>
        </Button>
      </div>
    ),
    [messagingThreadsStore, searchPlaceholder, t],
  );
  useSetTopBarActions(topBarNode);

  function selectThread(threadId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("threadId", threadId);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  const items = messagingThreadsStore.isReady ? messagingThreadsStore.items : threads.items;

  return (
    <div className="flex h-full flex-col">
      <DataViewActiveFiltersBar store={messagingThreadsStore} />

      <div className="flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
            <Inbox className="size-8 opacity-40" />

            <p className="text-sm">{t("Inbox.emptyState")}</p>
          </div>
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

      <DataViewPagination className="border-t border-border" store={messagingThreadsStore} />
    </div>
  );
});
