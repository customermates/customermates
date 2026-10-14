"use client";

import type { GetResult } from "@/core/base/base-get.interactor";
import type { MessagingThread } from "@/ee/messaging/messaging.schema";
import type { ReactNode } from "react";

import { useEffect } from "react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { reportApplicationError } from "@/core/errors/report-application-error";
import { ForbiddenError } from "@/core/errors/app-errors";
import { startBackgroundPoll } from "@/core/utils/background-poll";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { DataViewViewsRail } from "@/components/data-view/views/data-view-views-rail";
import { useDataViewSync } from "@/components/data-view/use-data-view-sync";
import { useRootStore } from "@/core/stores/root-store.provider";
import { serverRenderedClient } from "@/core/utils/server-rendered-client";

const INBOX_REFRESH_INTERVAL_MS = 10000;

type Props = {
  children: ReactNode;
  threads: GetResult<MessagingThread>;
  locked: boolean;
};

const InboxSurfaceContent = observer(function InboxSurface({ children, threads, locked }: Props) {
  const t = useTranslations();
  const { messagingThreadsStore, messagingThreadDetailStore } = useRootStore();
  const router = useRouter();
  const pathname = usePathname();

  useDataViewSync(messagingThreadsStore, threads);

  useEffect(() => {
    if (locked) return;
    return startBackgroundPoll({
      refresh: () => Promise.all([messagingThreadsStore.refresh(), messagingThreadDetailStore.refresh(true)]),
      onError: (error) => {
        if (!(error instanceof ForbiddenError)) reportApplicationError(error);
      },
      intervalMs: INBOX_REFRESH_INTERVAL_MS,
    });
  }, [locked, messagingThreadsStore, messagingThreadDetailStore]);

  const unavailableThreadId = messagingThreadDetailStore.unavailableThreadId;
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!unavailableThreadId || url.searchParams.get("threadId") !== unavailableThreadId) return;
    url.searchParams.delete("threadId");
    router.replace(`${pathname}${url.search}`, { scroll: false });
  }, [unavailableThreadId, router, pathname]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <DataViewViewsRail
        joinsTopBar
        countLabel={(count) => t("DataView.views.conversationCount", { count })}
        detailParam="threadId"
        store={messagingThreadsStore}
      />

      {children}
    </div>
  );
});

export const InboxSurface = serverRenderedClient(InboxSurfaceContent);
