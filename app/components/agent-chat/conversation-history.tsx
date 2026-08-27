"use client";

import type { AgentChatStore } from "./agent-chat.store";

import { observer } from "mobx-react-lite";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Archive, History, Loader2, Plus, RotateCcw, Trash2 } from "lucide-react";

import { type AgentConversationSummary } from "@/ee/agent-chat/agent-chat.schema";

import { useRootStore } from "@/core/stores/root-store.provider";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { runUserAction } from "@/core/errors/report-application-error";
import { Button } from "@/components/ui/button";
import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardFooter } from "@/components/card/app-card-footer";
import { AppCardHeader } from "@/components/card/app-card-header";
import { AppModal } from "@/components/modal/app-modal";
import { OVERLAY_SCROLL_REGION } from "@/components/ui/overlay-contract";
import { cn } from "@/core/utils/cn";

import { ActionTooltip, chatUiCopy } from "./chat-ui";

function historyLocked(
  store: Pick<AgentChatStore, "isWorking" | "conversationLoadPendingId" | "historyMutationPending">,
) {
  return store.isWorking || Boolean(store.conversationLoadPendingId) || Boolean(store.historyMutationPending);
}

export const ConversationHistory = observer(function ConversationHistory() {
  const { agentChatStore: store } = useRootStore();
  const intlStore = useHydratedIntlStore();
  const t = useTranslations();
  const copy = chatUiCopy(t);
  const hasHistory = store.conversations.length + store.archivedConversations.length > 0;
  const historyActionsDisabled = historyLocked(store);

  const archive = async (conversationId: string, index: number) => {
    const neighbor = store.conversations[index + 1] ?? store.conversations[index - 1] ?? null;
    const archived = await store.archiveConversation(conversationId);
    if (!archived) return;
    requestAnimationFrame(() => {
      const archivedStillVisible = store.conversations.some((conversation) => conversation.id === conversationId);
      const target = store.isHistoryOpen
        ? (document.getElementById(`agent-history-${archivedStillVisible ? conversationId : (neighbor?.id ?? "")}`) ??
          document.getElementById("agent-history-back"))
        : (document.getElementById("agent-composer") ?? document.getElementById("agent-panel-dialog"));
      target?.focus();
    });
  };

  const loadMoreActive = async () => {
    const priorIds = new Set(store.conversations.map((conversation) => conversation.id));
    await store.loadMoreConversations("active");
    const firstAdded = store.conversations.find((conversation) => !priorIds.has(conversation.id));
    requestAnimationFrame(() => {
      const target = firstAdded ? document.getElementById(`agent-history-${firstAdded.id}`) : null;
      (
        target ??
        document.getElementById("agent-load-more-active") ??
        document.getElementById("agent-history-back")
      )?.focus();
    });
  };

  if (store.conversations.length === 0) {
    return (
      <div className={cn(OVERLAY_SCROLL_REGION, "flex flex-col p-2")}>
        <ArchiveUndo />

        <ConversationHistoryStatus />

        {!hasHistory && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center text-muted-foreground">
            <History className="size-8 opacity-40" />

            <div>
              <p className="text-sm font-medium text-foreground">{copy.noChats}</p>

              <p className="mt-1 text-xs">{copy.noChatsBody}</p>
            </div>

            <Button disabled={historyActionsDisabled} size="sm" onClick={store.newConversation}>
              <Plus className="size-4" />

              {copy.newChat}
            </Button>
          </div>
        )}

        <ArchivedConversationList />
      </div>
    );
  }

  return (
    <div className={cn(OVERLAY_SCROLL_REGION, "p-2")} data-testid="agent-history">
      <ArchiveUndo />

      <ConversationHistoryStatus />

      <div className="space-y-1" role="list">
        {store.conversations.map((conversation) => {
          const index = store.conversations.findIndex((candidate) => candidate.id === conversation.id);
          return (
            <div
              key={conversation.id}
              className={cn(
                "group flex items-center gap-1 rounded-lg",
                conversation.id === store.conversationId && "bg-muted",
              )}
              role="listitem"
            >
              <Button
                aria-current={conversation.id === store.conversationId ? "true" : undefined}
                className="h-auto min-w-0 flex-1 justify-start rounded-lg px-3 py-2.5 text-left"
                disabled={historyActionsDisabled}
                id={`agent-history-${conversation.id}`}
                variant="ghost"
                onClick={() => runUserAction(() => store.selectConversation(conversation.id))}
              >
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{conversation.title || copy.untitled}</span>

                    <time
                      suppressHydrationWarning
                      className="ml-auto shrink-0 text-xs font-normal whitespace-nowrap text-muted-foreground"
                    >
                      {intlStore.formatRelativeTime(conversation.updatedAt)}
                    </time>
                  </span>

                  {conversation.preview && (
                    <span className="mt-0.5 block truncate text-xs font-normal text-muted-foreground">
                      {conversation.preview}
                    </span>
                  )}
                </span>
              </Button>

              <ActionTooltip label={copy.archive}>
                <Button
                  aria-label={`${copy.archive}: ${conversation.title || copy.untitled}`}
                  className="mr-1 size-8 shrink-0 opacity-70 transition-opacity hover:opacity-100 focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                  disabled={historyActionsDisabled}
                  size="icon"
                  variant="ghost"
                  onClick={() => runUserAction(() => archive(conversation.id, index))}
                >
                  <Archive className="size-4" />
                </Button>
              </ActionTooltip>
            </div>
          );
        })}
      </div>

      {store.conversationNextCursor && (
        <Button
          className="mt-2 w-full"
          disabled={historyActionsDisabled || Boolean(store.historyLoadMorePending)}
          id="agent-load-more-active"
          size="sm"
          variant="ghost"
          onClick={() => runUserAction(loadMoreActive)}
        >
          {store.historyLoadMorePending === "active" && <Loader2 className="size-3.5 animate-spin" />}

          {copy.loadMoreChats}
        </Button>
      )}

      <ArchivedConversationList />
    </div>
  );
});

export const ConversationHistoryStatus = observer(function ConversationHistoryStatus() {
  const { agentChatStore: store } = useRootStore();
  const copy = chatUiCopy(useTranslations());
  if (store.conversationLoadPendingId) {
    return (
      <div
        className="mb-2 flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground"
        role="status"
      >
        <Loader2 className="size-3.5 animate-spin" />

        {copy.loadingChat}
      </div>
    );
  }
  if (store.conversationLoadError) {
    return (
      <div
        className="mb-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
        role="alert"
      >
        {copy.loadChatFailed}
      </div>
    );
  }
  if (store.historyRefreshError) {
    return (
      <div
        className="mb-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
        role="alert"
      >
        {copy.refreshHistoryFailed}
      </div>
    );
  }
  return null;
});

export const ArchiveUndo = observer(function ArchiveUndo() {
  const { agentChatStore: store } = useRootStore();
  const copy = chatUiCopy(useTranslations());
  if (!store.lastArchivedConversation) return null;

  return (
    <div
      className="mb-2 flex items-center justify-between gap-3 rounded-lg border bg-muted/50 px-3 py-2 text-xs"
      role="status"
    >
      <span className="min-w-0 truncate">
        {`${copy.archived}: ${store.lastArchivedConversation.title || copy.untitled}`}
      </span>

      <Button
        className="h-7 shrink-0 px-2"
        disabled={historyLocked(store)}
        size="sm"
        variant="ghost"
        onClick={() => runUserAction(() => store.restoreLastArchivedConversation())}
      >
        {copy.undo}
      </Button>
    </div>
  );
});

export const ArchivedConversationList = observer(function ArchivedConversationList() {
  const { agentChatStore: store } = useRootStore();
  const copy = chatUiCopy(useTranslations());
  const [deleteCandidate, setDeleteCandidate] = useState<AgentConversationSummary | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [archivedOpen, setArchivedOpen] = useState(false);
  const conversations = store.archivedConversations;
  const historyActionsDisabled = historyLocked(store);

  if (conversations.length === 0 && !deleteCandidate) return null;

  const deletePermanently = async () => {
    if (!deleteCandidate || deletePending) return;
    const index = conversations.findIndex((conversation) => conversation.id === deleteCandidate.id);
    const focusId = conversations[index + 1]?.id ?? conversations[index - 1]?.id ?? null;
    setDeletePending(true);
    const deleted = await store.deleteArchivedConversation(deleteCandidate.id);
    setDeletePending(false);
    if (deleted) {
      setDeleteCandidate(null);
      requestAnimationFrame(() => {
        const target = focusId ? document.getElementById(`agent-archived-${focusId}`) : null;
        (target ?? document.getElementById("agent-history-back"))?.focus();
      });
    }
  };

  const loadMoreArchived = async () => {
    const priorIds = new Set(conversations.map((conversation) => conversation.id));
    await store.loadMoreConversations("archived");
    const firstAdded = store.archivedConversations.find((conversation) => !priorIds.has(conversation.id));
    requestAnimationFrame(() => {
      const target = firstAdded ? document.getElementById(`agent-archived-${firstAdded.id}`) : null;
      (
        target ??
        document.getElementById("agent-load-more-archived") ??
        document.getElementById("agent-archive-summary")
      )?.focus();
    });
  };

  return (
    <details
      className="mt-2 rounded-lg border bg-background/60 px-2 py-1.5 text-xs"
      open={archivedOpen}
      onToggle={(event) => setArchivedOpen(event.currentTarget.open)}
    >
      <summary className="cursor-pointer p-1 font-medium select-none" id="agent-archive-summary">
        {`${copy.archivedChats} (${conversations.length}${store.archivedConversationNextCursor ? "+" : ""})`}
      </summary>

      <div className="mt-1 space-y-1" role="list">
        {conversations.map((conversation) => (
          <div key={conversation.id} className="flex items-center gap-2 rounded-md px-2 py-1.5" role="listitem">
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{conversation.title || copy.untitled}</span>

              {conversation.preview && (
                <span className="block truncate text-muted-foreground">{conversation.preview}</span>
              )}
            </span>

            <ActionTooltip label={copy.restore}>
              <Button
                aria-label={`${copy.restore}: ${conversation.title || copy.untitled}`}
                className="size-7 shrink-0"
                disabled={historyActionsDisabled}
                id={`agent-archived-${conversation.id}`}
                size="icon"
                variant="ghost"
                onClick={() => runUserAction(() => store.restoreArchivedConversation(conversation.id))}
              >
                <RotateCcw className="size-3.5" />
              </Button>
            </ActionTooltip>

            <ActionTooltip label={copy.deleteChat}>
              <Button
                aria-label={`${copy.deleteChat}: ${conversation.title || copy.untitled}`}
                className="size-7 shrink-0 text-destructive hover:text-destructive"
                disabled={historyActionsDisabled}
                size="icon"
                variant="ghost"
                onClick={() => setDeleteCandidate(conversation)}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </ActionTooltip>
          </div>
        ))}

        {store.archivedConversationNextCursor && (
          <Button
            className="w-full"
            disabled={historyActionsDisabled || Boolean(store.historyLoadMorePending)}
            id="agent-load-more-archived"
            size="sm"
            variant="ghost"
            onClick={() => runUserAction(loadMoreArchived)}
          >
            {store.historyLoadMorePending === "archived" && <Loader2 className="size-3.5 animate-spin" />}

            {copy.loadMoreChats}
          </Button>
        )}
      </div>

      <AppModal
        open={Boolean(deleteCandidate)}
        size="sm"
        title={copy.deleteChatTitle}
        onClose={() => !deletePending && setDeleteCandidate(null)}
      >
        <AppCard>
          <AppCardHeader>
            <h2 className="text-base font-semibold">{copy.deleteChatTitle}</h2>
          </AppCardHeader>

          <AppCardBody>
            <p className="text-sm">{copy.deleteChatBody}</p>
          </AppCardBody>

          <AppCardFooter>
            <Button disabled={deletePending} variant="secondary" onClick={() => setDeleteCandidate(null)}>
              {copy.cancel}
            </Button>

            <Button disabled={deletePending} variant="destructive" onClick={() => runUserAction(deletePermanently)}>
              {deletePending && <Loader2 className="size-3.5 animate-spin" />}

              {copy.deletePermanently}
            </Button>
          </AppCardFooter>
        </AppCard>
      </AppModal>
    </details>
  );
});
