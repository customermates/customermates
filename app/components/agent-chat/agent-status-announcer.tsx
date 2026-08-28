"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";

import type { AgentChatItem } from "./agent-chat.store";

import { agentActivityCopy } from "@/ee/agent-chat/agent-activity";

import { useRootStore } from "@/core/stores/root-store.provider";
import { chatUiCopy } from "./chat-ui";
import { useAgentActivityTerminology } from "./agent-chat-items";

export const AgentStatusAnnouncer = observer(function AgentStatusAnnouncer() {
  const { agentChatStore: store } = useRootStore();
  const t = useTranslations();
  const copy = chatUiCopy(t);
  const terminology = useAgentActivityTerminology();

  const latestItem = store.items.at(-1);
  const latestUserIndex = store.items.findLastIndex((item) => item.kind === "user");
  const latestTurnActivity = store.items
    .slice(Math.max(0, latestUserIndex))
    .findLast((item): item is Extract<AgentChatItem, { kind: "activity" }> => item.kind === "activity");
  let status = "";
  if (store.isWorking && store.streamStatus === "resuming") status = t("AgentChat.approval.resuming");
  else if (store.isWorking && store.streamStatus === "reconnecting") status = copy.reconnecting;
  else if (store.isWorking && store.streamStatus === "stopping") status = copy.stopping;
  else if (store.isContinuingAfterApproval) status = t("AgentChat.approval.resuming");
  else if (store.isWorking && latestTurnActivity?.status === "running") {
    const activity = agentActivityCopy(latestTurnActivity.activity, t, terminology);
    status = activity.running;
  } else if (store.isWorking) status = copy.assistantWorking;
  else if (store.routeSyncStatus === "refreshing") status = copy.routeSyncRefreshing;
  else if (store.routeSyncStatus === "waiting") status = copy.routeSyncWaiting;
  else if (store.streamStatus === "finalizing") status = copy.finalizing;
  else if (store.hasInSessionTerminalResult && latestItem?.kind === "activity") {
    const activity = agentActivityCopy(latestItem.activity, t, terminology);
    status =
      latestItem.status === "error"
        ? activity.error
        : latestItem.status === "cancelled"
          ? activity.cancelled
          : activity.done;
  } else if (store.hasInSessionTerminalResult && latestItem?.kind === "assistant") status = copy.responseComplete;

  return (
    <span aria-atomic="true" aria-live="polite" className="sr-only" role="status">
      {status}
    </span>
  );
});

export const AgentProgressStatus = observer(function AgentProgressStatus() {
  const { agentChatStore: store } = useRootStore();
  const t = useTranslations();
  const copy = chatUiCopy(t);
  const label =
    store.isWorking && store.streamStatus === "reconnecting"
      ? copy.reconnecting
      : store.isWorking && store.streamStatus === "stopping"
        ? copy.stopping
        : store.isContinuingAfterApproval
          ? t("AgentChat.approval.resuming")
          : store.routeSyncStatus === "refreshing"
            ? copy.routeSyncRefreshing
            : store.routeSyncStatus === "waiting"
              ? copy.routeSyncWaiting
              : store.streamStatus === "finalizing"
                ? copy.finalizing
                : null;
  if (!label) return null;

  return (
    <div className="flex items-center gap-2 px-4 py-1 text-xs text-muted-foreground">
      <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />

      <span>{label}</span>
    </div>
  );
});
