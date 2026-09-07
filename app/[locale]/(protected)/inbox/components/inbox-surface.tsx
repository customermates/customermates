"use client";

import type { GetResult } from "@/core/base/base-get.interactor";
import type { MessagingThread } from "@/ee/messaging/messaging.schema";
import type { ReactNode } from "react";

import { observer } from "mobx-react-lite";

import { DataViewViewsRail } from "@/components/data-view/views/data-view-views-rail";
import { useDataViewSync } from "@/components/data-view/use-data-view-sync";
import { useRootStore } from "@/core/stores/root-store.provider";

type Props = {
  children: ReactNode;
  threads: GetResult<MessagingThread>;
};

export const InboxSurface = observer(function InboxSurface({ children, threads }: Props) {
  const { messagingThreadsStore } = useRootStore();

  useDataViewSync(messagingThreadsStore, threads);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <DataViewViewsRail joinsTopBar store={messagingThreadsStore} />

      {children}
    </div>
  );
});
