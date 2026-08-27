"use client";

import { observer } from "mobx-react-lite";
import type { useTranslations } from "next-intl";

import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function ActionTooltip({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>

      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export type ChatTranslator = ReturnType<typeof useTranslations>;

export function chatUiCopy(t: ChatTranslator) {
  return {
    archive: t("AgentChat.ui.archive"),
    archived: t("AgentChat.ui.archived"),
    archivedChats: t("AgentChat.ui.archivedChats"),
    assistantWorking: t("AgentChat.ui.assistantWorking"),
    back: t("AgentChat.ui.back"),
    cancel: t("AgentChat.ui.cancel"),
    chats: t("AgentChat.ui.chats"),
    deleteChat: t("AgentChat.ui.deleteChat"),
    deleteChatBody: t("AgentChat.ui.deleteChatBody"),
    deleteChatTitle: t("AgentChat.ui.deleteChatTitle"),
    deletePermanently: t("AgentChat.ui.deletePermanently"),
    editQueued: t("AgentChat.ui.editQueued"),
    history: t("AgentChat.ui.history"),
    jumpToLatest: t("AgentChat.ui.jumpToLatest"),
    loadChatFailed: t("AgentChat.ui.loadChatFailed"),
    loadMoreChats: t("AgentChat.ui.loadMoreChats"),
    loadOlderMessages: t("AgentChat.ui.loadOlderMessages"),
    loadingChat: t("AgentChat.ui.loadingChat"),
    loadingOlderMessages: t("AgentChat.ui.loadingOlderMessages"),
    newChat: t("AgentChat.ui.newChat"),
    noChats: t("AgentChat.ui.noChats"),
    noChatsBody: t("AgentChat.ui.noChatsBody"),
    queued: t("AgentChat.ui.queued"),
    refreshHistoryFailed: t("AgentChat.ui.refreshHistoryFailed"),
    removeQueued: t("AgentChat.ui.removeQueued"),
    responseComplete: t("AgentChat.ui.responseComplete"),
    restore: t("AgentChat.ui.restore"),
    retryTurn: t("AgentChat.ui.retryTurn"),
    turnFailed: t("AgentChat.ui.turnFailed"),
    undo: t("AgentChat.ui.undo"),
    untitled: t("AgentChat.ui.untitled"),
    thinking: t("AgentChat.ui.thinking"),
    stepsTook: (steps: number, seconds: number) => t("AgentChat.ui.stepsTook", { steps, seconds }),
  };
}

export function focusAgentComposer() {
  requestAnimationFrame(() => {
    const target = document.getElementById("agent-composer") ?? document.getElementById("agent-panel-dialog");
    target?.focus();
  });
}

export const ItemTime = observer(function ItemTime({ at }: { at?: Date }) {
  const intlStore = useHydratedIntlStore();
  if (!at) return null;

  return (
    <time suppressHydrationWarning className="text-[11px] whitespace-nowrap text-muted-foreground">
      {intlStore.formatTime(at)}
    </time>
  );
});

export function TypingDots() {
  return (
    <span className="flex items-center gap-1">
      {[0, 1, 2].map((dot) => (
        <span
          key={dot}
          className="size-1.5 rounded-full bg-muted-foreground/60 animate-typing-dot motion-reduce:animate-none"
          style={{ animationDelay: `${dot * 160}ms` }}
        />
      ))}
    </span>
  );
}
