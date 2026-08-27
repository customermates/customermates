"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

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
  if (store.isHistoryOpen) return null;

  const latestItem = store.items.at(-1);
  const latestUserIndex = store.items.findLastIndex((item) => item.kind === "user");
  const latestTurnActivity = store.items
    .slice(Math.max(0, latestUserIndex))
    .findLast((item): item is Extract<AgentChatItem, { kind: "activity" }> => item.kind === "activity");
  let status = "";
  if (store.isWorking && latestTurnActivity?.status === "running") {
    const activity = agentActivityCopy(latestTurnActivity.activity, t, terminology);
    status = activity.running;
  } else if (store.isWorking) status = copy.assistantWorking;
  else if (latestItem?.kind === "activity") {
    const activity = agentActivityCopy(latestItem.activity, t, terminology);
    status =
      latestItem.status === "error"
        ? activity.error
        : latestItem.status === "cancelled"
          ? activity.cancelled
          : activity.done;
  } else if (latestItem?.kind === "assistant") status = copy.responseComplete;

  return (
    <span aria-atomic="true" aria-live="polite" className="sr-only" role="status">
      {status}
    </span>
  );
});
