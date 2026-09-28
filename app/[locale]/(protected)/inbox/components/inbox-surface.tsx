"use client";

import type { GetResult } from "@/core/base/base-get.interactor";
import type { MessagingThread } from "@/ee/messaging/messaging.schema";
import type { ReactNode } from "react";

import { useEffect } from "react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { reportApplicationError } from "@/core/errors/report-application-error";
import { observer } from "mobx-react-lite";

import { DataViewViewsRail } from "@/components/data-view/views/data-view-views-rail";
import { useDataViewSync } from "@/components/data-view/use-data-view-sync";
import { useRootStore } from "@/core/stores/root-store.provider";

type Props = {
  children: ReactNode;
  threads: GetResult<MessagingThread>;
};

export const InboxSurface = observer(function InboxSurface({ children, threads }: Props) {
  const { messagingThreadsStore, messagingThreadDetailStore } = useRootStore();
  const router = useRouter();
  const pathname = usePathname();

  useDataViewSync(messagingThreadsStore, threads);

  useEffect(() => {
    let stopped = false;
    let pending = false;
    const refresh = async () => {
      if (stopped || pending || document.visibilityState !== "visible") return;
      pending = true;
      try {
        await Promise.all([messagingThreadsStore.refresh(), messagingThreadDetailStore.refresh(true)]);
      } finally {
        pending = false;
      }
    };
    const scheduleRefresh = () => {
      void refresh().catch((error) => {
        if (!stopped) reportApplicationError(error);
      });
    };
    const timer = window.setInterval(scheduleRefresh, 10000);
    document.addEventListener("visibilitychange", scheduleRefresh);
    window.addEventListener("focus", scheduleRefresh);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", scheduleRefresh);
      window.removeEventListener("focus", scheduleRefresh);
    };
  }, [messagingThreadsStore, messagingThreadDetailStore]);

  const unavailableThreadId = messagingThreadDetailStore.unavailableThreadId;
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!unavailableThreadId || url.searchParams.get("threadId") !== unavailableThreadId) return;
    url.searchParams.delete("threadId");
    router.replace(`${pathname}${url.search}`, { scroll: false });
  }, [unavailableThreadId, router, pathname]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <DataViewViewsRail joinsTopBar detailParam="threadId" store={messagingThreadsStore} />

      {children}
    </div>
  );
});
