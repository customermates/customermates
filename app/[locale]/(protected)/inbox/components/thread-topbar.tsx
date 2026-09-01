"use client";

import { useEffect, useMemo } from "react";
import { useTranslations } from "next-intl";
import { observer } from "mobx-react-lite";
import { RefreshCw } from "lucide-react";
import { Action, Resource } from "@/generated/prisma";

import type { MessagingThread } from "@/ee/messaging/messaging.schema";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { deriveThreadDisplay } from "@/ee/messaging/thread-display";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useSetTopBarActionsOverride } from "@/app/components/topbar-actions-context";
import { runUserAction } from "@/core/errors/report-application-error";

import { ThreadFolderChip } from "./thread-folder-chip";
import { ThreadSettings } from "./thread-settings";
import { ThreadStatePicker } from "./thread-state-picker";

type Props = {
  thread: MessagingThread;
};

export const ThreadTopBar = observer(({ thread }: Props) => {
  const t = useTranslations();
  const { messagingThreadDetailStore: store, userStore, layoutStore } = useRootStore();
  const canUpdate = userStore.can(Resource.inboxMessages, Action.update);

  const view = deriveThreadDisplay(thread, t);
  const title = view.displayName;
  const pictureUrl = view.avatarUrl ?? null;

  useEffect(() => {
    layoutStore.setRuntimeIdentity({
      scope: "inbox",
      key: thread.id,
      title,
      pictureUrl,
      avatarKind: "messaging",
    });

    return () => layoutStore.clearRuntimeIdentity("inbox", thread.id);
  }, [layoutStore, thread.id, title, pictureUrl]);

  const actions = useMemo(
    () => (
      <TooltipProvider>
        <div className="flex items-center gap-1">
          {canUpdate && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon-sm"
                  type="button"
                  variant="secondary"
                  onClick={() => runUserAction(() => store.resyncThread())}
                >
                  <RefreshCw className="size-3.5" />
                </Button>
              </TooltipTrigger>

              <TooltipContent>{t("Inbox.resyncThread")}</TooltipContent>
            </Tooltip>
          )}

          <ThreadSettings
            accountShared={thread.accountShared}
            isOwner={thread.isOwner}
            participants={thread.participants}
            provider={thread.provider}
            sharedToCrm={thread.sharedToCrm}
            threadId={thread.id}
          />

          <ThreadFolderChip />

          <ThreadStatePicker state={thread.state} />
        </div>
      </TooltipProvider>
    ),
    [
      canUpdate,
      store,
      t,
      thread.id,
      thread.state,
      thread.accountShared,
      thread.isOwner,
      thread.sharedToCrm,
      thread.provider,
      thread.participants,
    ],
  );

  useSetTopBarActionsOverride(actions);

  return null;
});
