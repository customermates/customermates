"use client";

import { observer } from "mobx-react-lite";
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  Sparkles,
  X,
  Maximize2,
  Minimize2,
  ArrowUp,
  Loader2,
  Check,
  Square,
  History,
  Plus,
  Archive,
  ChevronDown,
  ChevronLeft,
  WandSparkles,
  Columns3,
  Database,
  BarChart3,
  Pencil,
  RotateCcw,
  Search,
  Trash2,
} from "lucide-react";
import { Action, EntityType, Resource } from "@/generated/prisma";

import type { AgentChatItem } from "./agent-chat.store";

import { AgentTourOverlay } from "./agent-tour-overlay";

import { suggestionPageId, type AgentConversationSummary } from "@/features/agent-chat/agent-chat.schema";
import { agentActivityCopy, type AgentActivityResource } from "@/features/agent-chat/agent-activity";
import { agentPageActions, agentPageState } from "@/features/agent-chat/agent-page-actions";
import type { AgentUsageSummary } from "@/features/agent-chat/agent-usage.service";
import type { AgentWorkspaceSetupPlan } from "@/features/agent-chat/agent-workspace-setup";

import { MessageDateSeparator, isSameDay } from "@/app/[locale]/(protected)/inbox/components/message-date-separator";
import { MessagesScrollContainer } from "@/components/scroll/messages-scroll-container";
import { usePathname, useRouter } from "@/i18n/navigation";
import { useRootStore } from "@/core/stores/root-store.provider";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardFooter } from "@/components/card/app-card-footer";
import { AppCardHeader } from "@/components/card/app-card-header";
import { AppModal } from "@/components/modal/app-modal";
import { AppImage } from "@/components/shared/app-image";
import { MessageResponse } from "@/components/ai-elements/message";
import { useEntityTerminology } from "@/components/entity-terminology/use-entity-terminology";
import { cn } from "@/core/utils/cn";

export const AgentChat = observer(function AgentChat() {
  const { agentChatStore: store, agentUiControlStore } = useRootStore();
  const t = useTranslations();
  const copy = chatUiCopy(useTranslations());
  const router = useRouter();
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  const routerRef = useRef(router);
  const wasOpenRef = useRef(store.isOpen);
  const pendingNavigationRef = useRef<{
    path: string;
    resolve: (outcome: "navigated" | "timeout") => void;
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);
  pathnameRef.current = pathname;
  routerRef.current = router;

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    const load = async () => {
      const status = await store.loadConfig();
      if (cancelled || status !== "retry") return;
      const wait = Math.min(30000, 1000 * 2 ** attempt++);
      timer = setTimeout(() => void load(), wait);
    };

    if (store.enabled === null) void load();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [store]);

  useEffect(() => {
    const revalidate = () => {
      if (document.visibilityState === "visible") void store.revalidateSupportReplies();
    };
    const onVisibilityChange = () => revalidate();
    const interval = window.setInterval(revalidate, 60000);
    window.addEventListener("focus", revalidate);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", revalidate);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [store]);

  useEffect(() => {
    const pending = pendingNavigationRef.current;
    if (pending?.path === pathname) {
      clearTimeout(pending.timer);
      pendingNavigationRef.current = null;
      pending.resolve("navigated");
    }
  }, [pathname]);

  useEffect(() => {
    store.openForEmptyPage(pathname);
  }, [pathname, store, store.counts, store.enabled]);

  useEffect(() => {
    agentUiControlStore.registerNavigate(async (path) => {
      if (pathnameRef.current === path) return "navigated";
      const accepted = routerRef.current.push(path) as unknown as boolean;
      if (accepted === false) return "blocked";

      const current = pendingNavigationRef.current;
      if (current) {
        clearTimeout(current.timer);
        current.resolve("timeout");
      }
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          if (pendingNavigationRef.current?.timer === timer) pendingNavigationRef.current = null;
          resolve("timeout");
        }, 8000);
        pendingNavigationRef.current = { path, resolve, timer };
      });
    });
    return () => {
      agentUiControlStore.registerNavigate(null);
      const pending = pendingNavigationRef.current;
      if (pending) {
        clearTimeout(pending.timer);
        pending.resolve("timeout");
        pendingNavigationRef.current = null;
      }
    };
  }, [agentUiControlStore]);

  useEffect(() => {
    const wasOpen = wasOpenRef.current;
    wasOpenRef.current = store.isOpen;
    const targetId = store.isOpen
      ? store.isHistoryOpen
        ? "agent-history-back"
        : "agent-composer"
      : wasOpen
        ? "agent-launcher"
        : null;
    if (!targetId) return;
    requestAnimationFrame(() => {
      const target = document.getElementById(targetId) ?? document.getElementById("agent-panel-dialog");
      target?.focus();
    });
  }, [store.isHistoryOpen, store.isOpen]);

  if (store.enabled !== true) return null;

  return (
    <>
      {!store.isOpen && (
        <Button
          aria-label={
            store.unreadSupport > 0
              ? `${t("AgentChat.title")}. ${copy.unreadReplies(store.unreadSupport)}`
              : t("AgentChat.title")
          }
          className="fixed z-40 size-12 rounded-full shadow-lg"
          data-testid="agent-launcher"
          id="agent-launcher"
          size="icon"
          style={{
            right: "max(1rem, var(--safe-right))",
            bottom: "max(1rem, var(--safe-bottom))",
          }}
          onClick={store.open}
        >
          <AppImage alt="" className="size-7 rounded-lg" height={28} src="customermates-square.svg" width={28} />

          {store.unreadSupport > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 size-3 rounded-full bg-destructive"
              data-testid="agent-unread"
            >
              <span className="sr-only">{copy.unreadReplies(store.unreadSupport)}</span>
            </span>
          )}
        </Button>
      )}

      {store.isOpen && <AgentChatPanel />}

      <AgentTourOverlay />
    </>
  );
});

const AgentChatPanel = observer(function AgentChatPanel() {
  const { agentChatStore: store, agentUiControlStore } = useRootStore();
  const t = useTranslations();
  const copy = chatUiCopy(useTranslations());

  const usage = store.usage;
  const blocked = usage?.blockedReason ?? null;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented && !agentUiControlStore.active) store.close();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [agentUiControlStore, store]);

  const submit = () => {
    if (blocked) return;
    store.submitDraft();
  };

  return (
    <div
      aria-label={t("AgentChat.title")}
      className={cn(
        "fixed z-40 flex flex-col overflow-hidden rounded-xl border bg-background shadow-xl",
        store.isExpanded
          ? "h-[85dvh] w-[720px] max-w-[calc(100dvw-2rem)]"
          : "h-[560px] max-h-[calc(100dvh-2rem)] w-[400px] max-w-[calc(100dvw-2rem)]",
      )}
      data-testid="agent-panel"
      id="agent-panel-dialog"
      role="dialog"
      style={{
        right: "max(1rem, var(--safe-right))",
        bottom: "max(1rem, var(--safe-bottom))",
        maxHeight: "var(--overlay-block-budget)",
      }}
      tabIndex={-1}
    >
      <div className="flex items-center gap-1 border-b px-3 py-2">
        {store.isHistoryOpen ? (
          <Button
            aria-label={copy.back}
            className="size-7"
            disabled={Boolean(store.historyMutationPending)}
            id="agent-history-back"
            size="icon"
            title={copy.back}
            variant="ghost"
            onClick={store.toggleHistory}
          >
            <ChevronLeft className="size-4" />
          </Button>
        ) : (
          <AppImage alt="" className="size-5 rounded-md" height={20} src="customermates-square.svg" width={20} />
        )}

        <span className="mr-auto text-sm font-medium">{store.isHistoryOpen ? copy.chats : t("AgentChat.title")}</span>

        {!store.isHistoryOpen && (
          <Button
            aria-label={copy.history}
            className="size-7"
            size="icon"
            title={copy.history}
            variant="ghost"
            onClick={store.toggleHistory}
          >
            <History className="size-4" />
          </Button>
        )}

        <Button
          aria-label={copy.newChat}
          className="size-7"
          disabled={store.isWorking || store.isWorkspaceSetupPending || Boolean(store.historyMutationPending)}
          size="icon"
          title={copy.newChat}
          variant="ghost"
          onClick={store.newConversation}
        >
          <Plus className="size-4" />
        </Button>

        <Button
          aria-label={t(store.isExpanded ? "Common.actions.collapse" : "Common.actions.expand")}
          className="size-7"
          size="icon"
          title={t(store.isExpanded ? "Common.actions.collapse" : "Common.actions.expand")}
          variant="ghost"
          onClick={store.toggleExpanded}
        >
          {store.isExpanded ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
        </Button>

        <Button
          aria-label={t("Common.actions.close")}
          className="size-7"
          size="icon"
          title={t("Common.actions.close")}
          variant="ghost"
          onClick={store.close}
        >
          <X className="size-4" />
        </Button>
      </div>

      {!store.isHistoryOpen && store.lastArchivedConversation && (
        <div className="px-3 pt-2">
          <ArchiveUndo />
        </div>
      )}

      {store.isHistoryOpen ? (
        <ConversationHistory />
      ) : store.items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-muted-foreground">
          <Sparkles className="size-8 opacity-40" />

          <p className="text-sm">{t("AgentChat.empty")}</p>

          {!blocked && <SuggestedQuestions />}
        </div>
      ) : (
        <MessagesScrollContainer
          className="px-3"
          jumpToLatestLabel={copy.jumpToLatest}
          loadOlderLabel={copy.loadOlderMessages}
          scrollKey={store.conversationId ?? "new"}
          scrollRegionLabel={t("AgentChat.title")}
          onTopReach={store.olderMessagesCursor ? store.loadOlderMessages : undefined}
        >
          <div aria-atomic="false" aria-busy={store.isWorking} aria-live="off" className="space-y-3" role="log">
            {store.olderMessagesPending && (
              <div className="flex justify-center py-1" role="status">
                <Loader2 aria-label={copy.loadingOlderMessages} className="size-4 animate-spin text-muted-foreground" />
              </div>
            )}

            {store.items.map((item, index) => {
              const prev = store.items[index - 1];
              const showSeparator = item.at && (!prev?.at || !isSameDay(prev.at, item.at));

              return (
                <Fragment key={item.id}>
                  {showSeparator && item.at && <MessageDateSeparator date={item.at} />}

                  {item.kind === "activity" ? (
                    prev?.kind === "activity" ? null : (
                      <AgentActivity items={consecutiveActivityItems(store.items, index)} />
                    )
                  ) : (
                    <AgentChatItemView item={item} />
                  )}
                </Fragment>
              );
            })}

            {store.isWorking && store.items[store.items.length - 1]?.kind !== "assistant" && (
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            )}
          </div>
        </MessagesScrollContainer>
      )}

      <AgentStatusAnnouncer />

      {!store.isHistoryOpen && (
        <div className="px-3 pt-2 pb-3">
          <div className="rounded-xl bg-card p-2 shadow-xs transition-[color,box-shadow] focus-within:ring-[3px] focus-within:ring-ring/50 focus-within:ring-inset">
            <UsageFooter />

            {store.queuedPrompt && <QueuedPrompt />}

            {blocked && usage ? (
              <CreditBlockedNotice usage={usage} />
            ) : (
              <div className="flex items-end gap-2">
                <Textarea
                  aria-label={t("AgentChat.placeholder")}
                  className="max-h-40 min-h-9 flex-1 resize-none border-0 bg-transparent px-1 py-1.5 shadow-none focus-visible:border-0 focus-visible:ring-0"
                  data-testid="agent-composer"
                  disabled={store.isWorkspaceSetupPending}
                  id="agent-composer"
                  placeholder={t("AgentChat.placeholder")}
                  rows={2}
                  value={store.composerDraft}
                  onChange={(event) => store.setComposerDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                      event.preventDefault();
                      submit();
                    }
                  }}
                />

                <Button
                  aria-label={store.isWorking ? copy.queueAction : t("AgentChat.send")}
                  className="size-8"
                  disabled={store.isWorkspaceSetupPending || !store.composerDraft.trim() || Boolean(store.queuedPrompt)}
                  size="icon"
                  title={store.isWorking ? copy.queueAction : t("AgentChat.send")}
                  onClick={submit}
                >
                  <ArrowUp className="size-4" />
                </Button>

                {store.isWorking && (
                  <Button
                    aria-label={t("AgentChat.stop")}
                    className="size-8"
                    size="icon"
                    title={t("AgentChat.stop")}
                    variant="outline"
                    onClick={() => void store.interrupt()}
                  >
                    <Square className="size-4" />
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

const SuggestedQuestions = observer(function SuggestedQuestions() {
  const { agentChatStore: store, userStore } = useRootStore();
  const { map } = useEntityTerminology();
  const locale = useLocale();
  const pathname = usePathname();
  if (!store.counts) return null;

  const pageId = suggestionPageId(pathname);
  const pageResource =
    pageId === "contacts"
      ? Resource.contacts
      : pageId === "organizations"
        ? Resource.organizations
        : pageId === "deals"
          ? Resource.deals
          : pageId === "services"
            ? Resource.services
            : pageId === "tasks"
              ? Resource.tasks
              : null;
  const canSetupWorkspace =
    [Resource.contacts, Resource.organizations, Resource.deals, Resource.services, Resource.tasks].every(
      (resource) => userStore.can(resource, Action.create) && userStore.can(resource, Action.readAll),
    ) &&
    userStore.can(Resource.company, Action.readOwn) &&
    userStore.can(Resource.company, Action.update);
  const canCreate =
    pageId === "dashboard" ? canSetupWorkspace : Boolean(pageResource && userStore.can(pageResource, Action.create));
  const terminology = map();
  const actions = agentPageActions(pageId, agentPageState(pageId, store.counts), locale, {
    canCreate,
    canSetupWorkspace,
    terminology: {
      contacts: terminology[EntityType.contact],
      organizations: terminology[EntityType.organization],
      deals: terminology[EntityType.deal],
      services: terminology[EntityType.service],
      tasks: terminology[EntityType.task],
    },
  });

  const choose = (prompt: string) => {
    store.setComposerDraft(prompt);
    requestAnimationFrame(() => {
      const composer = document.getElementById("agent-composer") as HTMLTextAreaElement | null;
      composer?.focus();
      composer?.setSelectionRange(prompt.length, prompt.length);
    });
  };

  return (
    <div className="mt-1 flex w-full max-w-[280px] flex-col items-stretch gap-2" data-testid="agent-suggestions">
      {([1, 2, 3] as const).map((index) => {
        const action = actions[index - 1];
        if (!action) return null;
        const question = action.label;
        const prompt = action.prompt;

        return (
          <Button
            key={index}
            className="h-auto justify-center rounded-full px-3 py-2 text-xs font-normal"
            size="lg"
            variant="outline"
            onClick={() => choose(prompt)}
          >
            {question}
          </Button>
        );
      })}
    </div>
  );
});

const ConversationHistory = observer(function ConversationHistory() {
  const { agentChatStore: store } = useRootStore();
  const locale = useLocale();
  const copy = chatUiCopy(useTranslations());
  const [query, setQuery] = useState(store.historyQuery);
  const firstSearchRender = useRef(true);
  const hasHistory = store.conversations.length + store.archivedConversations.length > 0;
  const historyActionsDisabled =
    store.isWorking ||
    store.isWorkspaceSetupPending ||
    Boolean(store.conversationLoadPendingId) ||
    Boolean(store.historyMutationPending);

  useEffect(() => {
    if (firstSearchRender.current) {
      firstSearchRender.current = false;
      return;
    }
    const timer = setTimeout(() => void store.refreshConversations(query), 250);
    return () => clearTimeout(timer);
  }, [query, store]);

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

  const search =
    hasHistory || query ? (
      <label className="relative mb-2 block">
        <span className="sr-only">{copy.searchChats}</span>

        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
        />

        <Input
          className="h-9 px-8 text-xs"
          placeholder={copy.searchChats}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />

        {store.historySearchPending && (
          <Loader2
            aria-label={copy.searchingChats}
            className="absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 animate-spin text-muted-foreground"
          />
        )}
      </label>
    ) : null;

  if (store.conversations.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-2">
        <ArchiveUndo />

        <ConversationHistoryStatus />

        {search}

        {!hasHistory && !query.trim() && (
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

        {!hasHistory && query.trim() && !store.historySearchPending && (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground" role="status">
            {copy.noChatMatches}
          </p>
        )}

        <ArchivedConversationList />
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-2" data-testid="agent-history">
      <ArchiveUndo />

      <ConversationHistoryStatus />

      {search}

      {!hasHistory && query.trim() && !store.historySearchPending && (
        <p className="px-3 py-6 text-center text-xs text-muted-foreground" role="status">
          {copy.noChatMatches}
        </p>
      )}

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
                onClick={() => void store.selectConversation(conversation.id)}
              >
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{conversation.title || copy.untitled}</span>

                    {conversation.unreadSupport && (
                      <span className="size-2 shrink-0 rounded-full bg-info">
                        <span className="sr-only">{copy.unreadSupport}</span>
                      </span>
                    )}
                  </span>

                  {conversation.preview && (
                    <span className="mt-0.5 block truncate text-xs font-normal text-muted-foreground">
                      {conversation.preview}
                    </span>
                  )}

                  <time className="mt-1 block text-[11px] font-normal text-muted-foreground">
                    {conversation.updatedAt.toLocaleDateString(locale, {
                      day: "numeric",
                      month: "short",
                    })}
                  </time>
                </span>
              </Button>

              <Button
                aria-label={`${copy.archive}: ${conversation.title || copy.untitled}`}
                className="mr-1 size-8 shrink-0 opacity-70 transition-opacity hover:opacity-100 focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                disabled={historyActionsDisabled}
                size="icon"
                title={copy.archive}
                variant="ghost"
                onClick={() => void archive(conversation.id, index)}
              >
                <Archive className="size-4" />
              </Button>
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
          onClick={() => void loadMoreActive()}
        >
          {store.historyLoadMorePending === "active" && <Loader2 className="size-3.5 animate-spin" />}

          {copy.loadMoreChats}
        </Button>
      )}

      <ArchivedConversationList />
    </div>
  );
});

const ConversationHistoryStatus = observer(function ConversationHistoryStatus() {
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

const ArchiveUndo = observer(function ArchiveUndo() {
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
        disabled={
          store.isWorking ||
          store.isWorkspaceSetupPending ||
          Boolean(store.conversationLoadPendingId) ||
          Boolean(store.historyMutationPending)
        }
        size="sm"
        variant="ghost"
        onClick={() => void store.restoreLastArchivedConversation()}
      >
        {copy.undo}
      </Button>
    </div>
  );
});

const ArchivedConversationList = observer(function ArchivedConversationList() {
  const { agentChatStore: store } = useRootStore();
  const copy = chatUiCopy(useTranslations());
  const [deleteCandidate, setDeleteCandidate] = useState<AgentConversationSummary | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [archivedOpen, setArchivedOpen] = useState(Boolean(store.historyQuery));
  const conversations = store.archivedConversations;
  const historyActionsDisabled =
    store.isWorking ||
    store.isWorkspaceSetupPending ||
    Boolean(store.conversationLoadPendingId) ||
    Boolean(store.historyMutationPending);

  useEffect(() => {
    if (store.historyQuery) setArchivedOpen(true);
  }, [store.historyQuery]);

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

            <Button
              aria-label={`${copy.restore}: ${conversation.title || copy.untitled}`}
              className="size-7 shrink-0"
              disabled={historyActionsDisabled}
              id={`agent-archived-${conversation.id}`}
              size="icon"
              title={copy.restore}
              variant="ghost"
              onClick={() => void store.restoreArchivedConversation(conversation.id)}
            >
              <RotateCcw className="size-3.5" />
            </Button>

            <Button
              aria-label={`${copy.deleteChat}: ${conversation.title || copy.untitled}`}
              className="size-7 shrink-0 text-destructive hover:text-destructive"
              disabled={historyActionsDisabled}
              size="icon"
              title={copy.deleteChat}
              variant="ghost"
              onClick={() => setDeleteCandidate(conversation)}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        ))}

        {store.archivedConversationNextCursor && (
          <Button
            className="w-full"
            disabled={historyActionsDisabled || Boolean(store.historyLoadMorePending)}
            id="agent-load-more-archived"
            size="sm"
            variant="ghost"
            onClick={() => void loadMoreArchived()}
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
            <Button disabled={deletePending} variant="outline" onClick={() => setDeleteCandidate(null)}>
              {copy.cancel}
            </Button>

            <Button disabled={deletePending} variant="destructive" onClick={() => void deletePermanently()}>
              {deletePending && <Loader2 className="size-3.5 animate-spin" />}

              {copy.deletePermanently}
            </Button>
          </AppCardFooter>
        </AppCard>
      </AppModal>
    </details>
  );
});

type ChatTranslator = ReturnType<typeof useTranslations>;

function chatUiCopy(t: ChatTranslator) {
  return {
    archive: t("AgentChat.ui.archive"),
    archived: t("AgentChat.ui.archived"),
    archivedChats: t("AgentChat.ui.archivedChats"),
    assistantWorking: t("AgentChat.ui.assistantWorking"),
    back: t("AgentChat.ui.back"),
    cancel: t("AgentChat.ui.cancel"),
    chats: t("AgentChat.ui.chats"),
    creditUnavailable: t("AgentChat.ui.creditUnavailable"),
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
    noChatMatches: t("AgentChat.ui.noChatMatches"),
    noChats: t("AgentChat.ui.noChats"),
    noChatsBody: t("AgentChat.ui.noChatsBody"),
    queueAction: t("AgentChat.ui.queueAction"),
    queued: t("AgentChat.ui.queued"),
    refreshHistoryFailed: t("AgentChat.ui.refreshHistoryFailed"),
    removeQueued: t("AgentChat.ui.removeQueued"),
    responseComplete: t("AgentChat.ui.responseComplete"),
    restore: t("AgentChat.ui.restore"),
    retryTurn: t("AgentChat.ui.retryTurn"),
    searchChats: t("AgentChat.ui.searchChats"),
    searchingChats: t("AgentChat.ui.searchingChats"),
    turnFailed: t("AgentChat.ui.turnFailed"),
    undo: t("AgentChat.ui.undo"),
    unreadSupport: t("AgentChat.ui.unreadSupport"),
    untitled: t("AgentChat.ui.untitled"),
    activitySummary: (status: "running" | "error" | "cancelled" | "complete", count: number) =>
      t(`AgentChat.ui.activity${status.charAt(0).toUpperCase()}${status.slice(1)}`, { count }),
    unreadReplies: (count: number) => t("AgentChat.ui.unreadReplies", { count }),
  };
}

function focusAgentComposer() {
  requestAnimationFrame(() => {
    const target = document.getElementById("agent-composer") ?? document.getElementById("agent-panel-dialog");
    target?.focus();
  });
}

function useAgentActivityTerminology(): Partial<Record<AgentActivityResource, string>> {
  const { plural } = useEntityTerminology();
  return {
    contacts: plural(EntityType.contact),
    organizations: plural(EntityType.organization),
    deals: plural(EntityType.deal),
    services: plural(EntityType.service),
    tasks: plural(EntityType.task),
  };
}

const QueuedPrompt = observer(function QueuedPrompt() {
  const { agentChatStore: store } = useRootStore();
  const copy = chatUiCopy(useTranslations());
  const rowRef = useRef<HTMLDivElement>(null);
  const prompt = store.queuedPrompt;

  useLayoutEffect(
    () => () => {
      if (rowRef.current?.contains(document.activeElement)) focusAgentComposer();
    },
    [],
  );

  if (!prompt) return null;

  return (
    <div ref={rowRef} className="mb-2 flex items-center gap-2 rounded-lg bg-muted/60 px-2 py-1.5 text-xs" role="status">
      <span className="min-w-0 flex-1 truncate">
        <span className="font-medium">{copy.queued}:</span>

        <span>{` ${prompt}`}</span>
      </span>

      <Button
        aria-label={copy.editQueued}
        className="size-7 shrink-0"
        disabled={Boolean(store.usage?.blockedReason) || store.isWorkspaceSetupPending}
        size="icon"
        title={copy.editQueued}
        variant="ghost"
        onClick={store.editQueuedPrompt}
      >
        <Pencil className="size-3.5" />
      </Button>

      <Button
        aria-label={copy.removeQueued}
        className="size-7 shrink-0"
        size="icon"
        title={copy.removeQueued}
        variant="ghost"
        onClick={store.removeQueuedPrompt}
      >
        <X className="size-3.5" />
      </Button>
    </div>
  );
});

const UsageFooter = observer(function UsageFooter() {
  const { agentChatStore: store } = useRootStore();
  const t = useTranslations();
  const locale = useLocale();
  if (!store.usage) return null;
  const usage = store.usage;
  const copy = chatUiCopy(t);
  if (usage.creditsLimit <= 0) {
    return (
      <div
        className="flex w-full items-center justify-between gap-2 px-1 pb-2 text-xs text-muted-foreground"
        data-testid="agent-usage"
      >
        <span>{usage.plan ? t(`Subscription.planNames.${usage.plan}`) : t("AgentChat.title")}</span>

        <span>{copy.creditUnavailable}</span>
      </div>
    );
  }
  const pct = usage.usedPct;
  const resetAt = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
  }).format(new Date(usage.resetAt));

  return (
    <details className="group w-full px-1 pb-2 text-xs text-muted-foreground" data-testid="agent-usage">
      <summary className="cursor-pointer list-none rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span>{t("AgentChat.credits.resetShort", { resetAt })}</span>

          <span className="flex items-center gap-1 tabular-nums">
            {t("AgentChat.credits.usedPercent", { pct })}

            <ChevronDown className="size-3 transition-transform group-open:rotate-180" />
          </span>
        </div>

        <div
          aria-label={t("AgentChat.credits.usage", { pct })}
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={pct}
          className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
        >
          <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${pct}%` }} />
        </div>
      </summary>

      <div className="mt-2 space-y-1 rounded-lg bg-muted/40 px-2.5 py-2">
        <p className="font-medium text-foreground tabular-nums">
          {t("AgentChat.credits.remaining", {
            remaining: usage.creditsRemaining,
            limit: usage.creditsLimit,
          })}
        </p>

        <p>
          {usage.plan
            ? t("AgentChat.credits.planAndReset", {
                plan: t(`Subscription.planNames.${usage.plan}`),
                resetAt,
              })
            : t("AgentChat.credits.resetShort", { resetAt })}
        </p>

        {usage.recentTurnCredits !== null && (
          <p>
            {t("AgentChat.credits.recentTurn", {
              credits: usage.recentTurnCredits,
            })}
          </p>
        )}
      </div>
    </details>
  );
});

function CreditBlockedNotice({ usage }: { usage: AgentUsageSummary }) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const reason = usage.blockedReason ?? "credits_exhausted";
  const resetAt = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
  }).format(new Date(usage.resetAt));
  const contact = reason === "enterprise_allowance_missing" || reason === "configuration_unavailable";

  return (
    <div className="flex items-start justify-between gap-3 px-1 py-2" role="status">
      <p className="text-sm text-muted-foreground">{t(`AgentChat.credits.blocked.${reason}`, { resetAt })}</p>

      <Button
        className="shrink-0"
        size="sm"
        variant="outline"
        onClick={() => {
          if (contact) window.location.assign("mailto:support@customermates.com?subject=Hosted%20Assistant%20credits");
          else router.push("/company/subscription");
        }}
      >
        {t(contact ? "AgentChat.credits.contact" : "AgentChat.credits.viewPlans")}
      </Button>
    </div>
  );
}

const AgentStatusAnnouncer = observer(function AgentStatusAnnouncer() {
  const { agentChatStore: store } = useRootStore();
  const locale = useLocale();
  const copy = chatUiCopy(useTranslations());
  const terminology = useAgentActivityTerminology();
  if (store.isHistoryOpen) return null;

  const latestItem = store.items.at(-1);
  const latestUserIndex = store.items.findLastIndex((item) => item.kind === "user");
  const latestTurnActivity = store.items
    .slice(Math.max(0, latestUserIndex))
    .findLast((item): item is Extract<AgentChatItem, { kind: "activity" }> => item.kind === "activity");
  let status = "";
  if (store.isWorking && latestTurnActivity?.status === "running") {
    const activity = agentActivityCopy(latestTurnActivity.activity, locale, terminology);
    status = activity.running;
  } else if (store.isWorking) status = copy.assistantWorking;
  else if (latestItem?.kind === "activity") {
    const activity = agentActivityCopy(latestItem.activity, locale, terminology);
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

const ItemTime = observer(function ItemTime({ at }: { at?: Date }) {
  const { intlStore } = useRootStore();
  if (!at) return null;

  return (
    <time suppressHydrationWarning className="text-[11px] text-muted-foreground opacity-60">
      {intlStore.formatTime(at)}
    </time>
  );
});

const AgentChatItemView = observer(function AgentChatItemView({ item }: { item: AgentChatItem }) {
  const { agentChatStore: store } = useRootStore();
  const t = useTranslations();
  const locale = useLocale();
  const terminology = useAgentActivityTerminology();
  const decideApproval = async (
    approval: Extract<AgentChatItem, { kind: "approval" }>,
    decision: "approve" | "reject" | "always",
  ) => {
    await store.respondToApproval(approval, decision);
    if (approval.resolution) focusAgentComposer();
  };

  if (item.kind === "user") {
    return (
      <article aria-label={t("Inbox.senderYou")} className="group/message flex justify-end">
        <div className="flex max-w-[85%] flex-col items-end gap-1">
          <div className="w-fit rounded-xl rounded-br-md bg-card px-3 py-2 text-sm whitespace-pre-wrap shadow-xs">
            {item.text}
          </div>

          <ItemTime at={item.at} />
        </div>
      </article>
    );
  }

  if (item.kind === "support") {
    return (
      <article
        aria-label={t("AgentChat.support.badge")}
        className="rounded-xl border border-info/40 bg-info/10 px-3 py-2 text-sm shadow-xs"
        data-testid="agent-support-message"
      >
        <Badge className="mb-1" variant="info">
          {t("AgentChat.support.badge")}
        </Badge>

        <p className="whitespace-pre-wrap">{item.text}</p>
      </article>
    );
  }

  if (item.kind === "assistant") {
    return (
      <article aria-label={t("AgentChat.title")} className="group/message flex gap-2">
        <Avatar className="self-end" size="lg">
          <AppImage alt="" className="size-full" height={32} src="customermates-square.svg" width={32} />
        </Avatar>

        <div className="flex min-w-0 max-w-[85%] flex-col items-start gap-1">
          <div className="w-full p-1 text-sm [&_pre]:overflow-x-auto">
            <MessageResponse>{item.text}</MessageResponse>

            {item.streaming && <Loader2 className="mt-1 size-3 animate-spin text-muted-foreground" />}
          </div>

          <ItemTime at={item.at} />
        </div>
      </article>
    );
  }

  if (item.kind === "turn_error") {
    const copy = chatUiCopy(t);
    return (
      <div
        className="flex items-center justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs"
        role="alert"
      >
        <span>{copy.turnFailed}</span>

        <Button
          className="shrink-0"
          disabled={
            store.isWorking ||
            store.isWorkspaceSetupPending ||
            Boolean(store.usage?.blockedReason) ||
            !store.canRetryFailedTurn(item)
          }
          size="sm"
          variant="outline"
          onClick={() => {
            store.retryFailedTurn(item);
            focusAgentComposer();
          }}
        >
          {copy.retryTurn}
        </Button>
      </div>
    );
  }

  if (item.kind === "workspace_setup") return <WorkspaceSetupCard item={item} />;

  if (item.kind === "activity") return <AgentActivity items={[item]} />;

  const copy = agentActivityCopy(item.activity, locale, terminology);

  return (
    <div
      className="rounded-xl border border-warning/50 bg-warning/10 px-3 py-2 text-sm shadow-xs"
      data-testid="agent-approval"
    >
      <div className="flex items-center gap-2">
        <Badge variant="warning">{t("AgentChat.approval.title")}</Badge>

        <span className="text-xs font-medium">{copy.running}</span>
      </div>

      {copy.detail && <p className="mt-2 text-xs text-muted-foreground">{copy.detail}</p>}

      {item.resolution ? (
        <p className="mt-2 text-xs text-muted-foreground">{t(`AgentChat.approval.${item.resolution}`)}</p>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          <Button
            aria-busy={item.pendingDecision === "approve"}
            disabled={Boolean(item.pendingDecision) || store.isWorkspaceSetupPending}
            size="sm"
            onClick={() => void decideApproval(item, "approve")}
          >
            {item.pendingDecision === "approve" && <Loader2 className="size-3.5 animate-spin" />}

            {t("AgentChat.approval.approveAction")}
          </Button>

          <Button
            aria-busy={item.pendingDecision === "reject"}
            disabled={Boolean(item.pendingDecision) || store.isWorkspaceSetupPending}
            size="sm"
            variant="outline"
            onClick={() => void decideApproval(item, "reject")}
          >
            {item.pendingDecision === "reject" && <Loader2 className="size-3.5 animate-spin" />}

            {t("AgentChat.approval.rejectAction")}
          </Button>

          {(item.activity.kind === "records.create" || item.activity.kind === "records.update") && (
            <Button
              aria-busy={item.pendingDecision === "always"}
              disabled={Boolean(item.pendingDecision) || store.isWorkspaceSetupPending}
              size="sm"
              variant="ghost"
              onClick={() => void decideApproval(item, "always")}
            >
              {item.pendingDecision === "always" && <Loader2 className="size-3.5 animate-spin" />}

              {t("AgentChat.approval.alwaysAction")}
            </Button>
          )}
        </div>
      )}
    </div>
  );
});

const WorkspaceSetupCard = observer(function WorkspaceSetupCard({
  item,
}: {
  item: Extract<AgentChatItem, { kind: "workspace_setup" }>;
}) {
  const { agentChatStore: store } = useRootStore();
  const copy = workspaceSetupCopy(useTranslations());
  const { presetLabel } = useEntityTerminology();
  const [reviewOpen, setReviewOpen] = useState(item.status === "ready");
  const [confirmFullCleanup, setConfirmFullCleanup] = useState(false);
  const cardRef = useRef<HTMLElement>(null);
  const fullCleanupTriggerRef = useRef<HTMLButtonElement>(null);
  const fullCleanupCancelRef = useRef<HTMLButtonElement>(null);
  const wasPending = useRef(Boolean(item.pendingAction));
  const { plan } = item;
  const terminologyLabels = [
    presetLabel(EntityType.contact, plan.terminology.contact, "plural"),
    presetLabel(EntityType.organization, plan.terminology.organization, "plural"),
    presetLabel(EntityType.deal, plan.terminology.deal, "plural"),
    presetLabel(EntityType.service, plan.terminology.service, "plural"),
  ];
  const entityLabels: Record<AgentWorkspaceSetupPlan["columns"][number]["entityType"], string> = {
    contact: presetLabel(EntityType.contact, plan.terminology.contact, "singular"),
    organization: presetLabel(EntityType.organization, plan.terminology.organization, "singular"),
    deal: presetLabel(EntityType.deal, plan.terminology.deal, "singular"),
    service: presetLabel(EntityType.service, plan.terminology.service, "singular"),
    task: copy.entities.task,
  };
  const recordCount =
    plan.records.organizations.length +
    plan.records.contacts.length +
    plan.records.services.length +
    plan.records.deals.length +
    plan.records.tasks.length;
  const status = item.pendingAction ? copy.pending[item.pendingAction] : copy.status[item.status];
  const statusVariant =
    item.status === "applied" || item.status === "cleaned"
      ? "success"
      : item.status === "failed" || item.status === "notEmpty"
        ? "destructive"
        : item.status === "partiallyCleaned"
          ? "warning"
          : "secondary";

  useEffect(() => {
    if (item.status === "ready") setReviewOpen(true);
    if (item.status !== "partiallyCleaned") setConfirmFullCleanup(false);
  }, [item.status]);

  useEffect(() => {
    const completed = wasPending.current && !item.pendingAction;
    wasPending.current = Boolean(item.pendingAction);
    if (!completed) return;
    requestAnimationFrame(() => cardRef.current?.focus());
  }, [item.pendingAction]);

  useEffect(() => {
    if (confirmFullCleanup) requestAnimationFrame(() => fullCleanupCancelRef.current?.focus());
  }, [confirmFullCleanup]);

  return (
    <section
      ref={cardRef}
      aria-labelledby={`${item.id}-title`}
      className="rounded-xl border bg-card p-3 shadow-xs"
      data-testid="agent-workspace-setup"
      tabIndex={-1}
    >
      <div className="flex items-start gap-2">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <WandSparkles aria-hidden="true" className="size-4" />
        </span>

        <div className="min-w-0">
          <h3 className="text-sm font-medium" id={`${item.id}-title`}>
            {copy.title}
          </h3>

          <p className="mt-0.5 text-xs text-muted-foreground">{plan.goal || copy.description}</p>
        </div>
      </div>

      <div
        aria-live={item.status === "failed" ? undefined : "polite"}
        className="mt-3 flex flex-wrap items-center gap-2"
        role={item.status === "failed" ? "alert" : "status"}
      >
        <Badge variant={statusVariant}>{status.label}</Badge>

        {item.pendingAction && <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />}

        <p className="min-w-0 flex-1 text-xs text-muted-foreground">{status.description}</p>
      </div>

      {item.cleanupSummary && (
        <p className="mt-2 text-xs text-muted-foreground">{copy.cleanupSummary(item.cleanupSummary)}</p>
      )}

      <div aria-label={copy.summary} className="mt-3 grid grid-cols-3 gap-2">
        <SetupMetric icon={Columns3} label={copy.fields} value={plan.columns.length} />

        <SetupMetric icon={Database} label={copy.records} value={recordCount} />

        <SetupMetric icon={BarChart3} label={copy.widgets} value={plan.widgets.length} />
      </div>

      <details
        aria-busy={Boolean(item.pendingAction)}
        className="mt-3 rounded-lg border bg-background/60 px-3 py-2 text-xs"
        open={reviewOpen}
        onToggle={(event) => setReviewOpen(event.currentTarget.open)}
      >
        <summary className="cursor-pointer font-medium select-none">{copy.review}</summary>

        <div className="mt-3 space-y-3 text-muted-foreground">
          <div>
            <p className="font-medium text-foreground">{copy.terminology}</p>

            <p className="mt-1">{terminologyLabels.join(" · ")}</p>
          </div>

          <div>
            <p className="font-medium text-foreground">{copy.fields}</p>

            <ul className="mt-1 space-y-1">
              {plan.columns.map((column) => (
                <li key={column.semanticKey}>
                  <span className="font-medium text-foreground">{column.label}</span>

                  <span> · {entityLabels[column.entityType]}</span>

                  {column.options.length > 0 && <span> · {column.options.join(", ")}</span>}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="font-medium text-foreground">{copy.sampleData}</p>

            <p className="mt-1">
              {copy.sampleDataDetail({
                organizations: plan.records.organizations.length,
                contacts: plan.records.contacts.length,
                services: plan.records.services.length,
                deals: plan.records.deals.length,
                tasks: plan.records.tasks.length,
              })}
            </p>

            <div className="mt-2 space-y-1">
              <p>
                <span className="font-medium text-foreground">{copy.organizations}:</span>

                <span>{` ${plan.records.organizations.join(", ")}`}</span>
              </p>

              <p>
                <span className="font-medium text-foreground">{copy.contacts}:</span>

                <span>{` ${plan.records.contacts.map((contact) => `${contact.firstName} ${contact.lastName}`.trim()).join(", ")}`}</span>
              </p>

              <p>
                <span className="font-medium text-foreground">{copy.services}:</span>

                <span>{` ${plan.records.services.map((service) => service.name).join(", ")}`}</span>
              </p>

              <p>
                <span className="font-medium text-foreground">{copy.deals}:</span>

                <span>{` ${plan.records.deals.map((deal) => deal.name).join(", ")}`}</span>
              </p>

              <p>
                <span className="font-medium text-foreground">{copy.tasks}:</span>

                <span>{` ${plan.records.tasks.map((task) => `${task.name} (${copy.dueInDays(task.dueInDays)})`).join(", ")}`}</span>
              </p>
            </div>
          </div>

          <div>
            <p className="font-medium text-foreground">{copy.widgets}</p>

            <ul className="mt-1 list-inside list-disc">
              {plan.widgets.map((widget) => (
                <li key={widget.semanticKey}>{widget.name}</li>
              ))}
            </ul>
          </div>
        </div>
      </details>

      {item.status === "ready" && <p className="mt-3 text-xs text-muted-foreground">{copy.safety}</p>}

      {item.status === "ready" && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            disabled={store.isWorking || store.isWorkspaceSetupPending || Boolean(item.pendingAction)}
            size="sm"
            onClick={() => void store.applyWorkspaceSetup(item)}
          >
            {item.pendingAction === "apply" && <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />}

            {copy.applyPlan}
          </Button>

          <Button
            disabled={store.isWorking || store.isWorkspaceSetupPending || Boolean(item.pendingAction)}
            size="sm"
            variant="outline"
            onClick={() => {
              store.editWorkspaceSetup(copy.editPrompt);
              focusAgentComposer();
            }}
          >
            <Pencil aria-hidden="true" className="size-3.5" />

            {copy.editPlan}
          </Button>
        </div>
      )}

      {item.status === "applied" && (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-muted-foreground">{copy.safeCleanup}</p>

          <Button
            disabled={store.isWorking || store.isWorkspaceSetupPending || Boolean(item.pendingAction)}
            size="sm"
            variant="outline"
            onClick={() => void store.cleanupWorkspaceSetup(item, "safe")}
          >
            {item.pendingAction === "safeCleanup" && <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />}

            {copy.removeSetup}
          </Button>
        </div>
      )}

      {item.status === "partiallyCleaned" && item.cleanupSummary?.retainedReasons.includes("edited") && (
        <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 p-2.5">
          <p className="text-xs text-muted-foreground">{copy.fullCleanup}</p>

          {confirmFullCleanup ? (
            <div aria-label={copy.fullCleanup} className="mt-2 flex flex-wrap gap-2" role="group">
              <Button
                ref={fullCleanupCancelRef}
                disabled={store.isWorking || store.isWorkspaceSetupPending || Boolean(item.pendingAction)}
                size="sm"
                variant="ghost"
                onClick={() => {
                  setConfirmFullCleanup(false);
                  requestAnimationFrame(() => fullCleanupTriggerRef.current?.focus());
                }}
              >
                {copy.cancel}
              </Button>

              <Button
                disabled={store.isWorking || store.isWorkspaceSetupPending || Boolean(item.pendingAction)}
                size="sm"
                variant="destructive"
                onClick={() => void store.cleanupWorkspaceSetup(item, "full")}
              >
                {item.pendingAction === "fullCleanup" && (
                  <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
                )}

                {copy.confirmFullCleanup}
              </Button>
            </div>
          ) : (
            <Button
              ref={fullCleanupTriggerRef}
              className="mt-2"
              disabled={store.isWorking || store.isWorkspaceSetupPending || Boolean(item.pendingAction)}
              size="sm"
              variant="outline"
              onClick={() => setConfirmFullCleanup(true)}
            >
              {copy.removeEdited}
            </Button>
          )}
        </div>
      )}

      {item.errorAction && (
        <p className="mt-2 text-xs text-destructive" role="alert">
          {copy.actionFailed}
        </p>
      )}
    </section>
  );
});

function SetupMetric({ icon: Icon, label, value }: { icon: typeof Columns3; label: string; value: number }) {
  return (
    <div className="rounded-lg bg-muted/50 p-2">
      <Icon aria-hidden="true" className="mb-1 size-3.5 text-muted-foreground" />

      <p className="text-sm font-semibold tabular-nums">{value}</p>

      <p className="truncate text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

function workspaceSetupCopy(t: ChatTranslator) {
  return {
    actionFailed: t("AgentChat.setup.actionFailed"),
    applyPlan: t("AgentChat.setup.applyPlan"),
    cancel: t("AgentChat.setup.cancel"),
    confirmFullCleanup: t("AgentChat.setup.confirmFullCleanup"),
    contacts: t("AgentChat.setup.contacts"),
    deals: t("AgentChat.setup.deals"),
    description: t("AgentChat.setup.description"),
    editPlan: t("AgentChat.setup.editPlan"),
    editPrompt: t("AgentChat.setup.editPrompt"),
    entities: {
      contact: t("AgentChat.setup.entities.contact"),
      deal: t("AgentChat.setup.entities.deal"),
      organization: t("AgentChat.setup.entities.organization"),
      service: t("AgentChat.setup.entities.service"),
      task: t("AgentChat.setup.entities.task"),
    },
    fields: t("AgentChat.setup.fields"),
    fullCleanup: t("AgentChat.setup.fullCleanup"),
    organizations: t("AgentChat.setup.organizations"),
    pending: {
      apply: {
        description: t("AgentChat.setup.pending.apply.description"),
        label: t("AgentChat.setup.pending.apply.label"),
      },
      fullCleanup: {
        description: t("AgentChat.setup.pending.fullCleanup.description"),
        label: t("AgentChat.setup.pending.fullCleanup.label"),
      },
      safeCleanup: {
        description: t("AgentChat.setup.pending.safeCleanup.description"),
        label: t("AgentChat.setup.pending.safeCleanup.label"),
      },
    },
    records: t("AgentChat.setup.records"),
    removeEdited: t("AgentChat.setup.removeEdited"),
    removeSetup: t("AgentChat.setup.removeSetup"),
    review: t("AgentChat.setup.review"),
    safeCleanup: t("AgentChat.setup.safeCleanup"),
    safety: t("AgentChat.setup.safety"),
    sampleData: t("AgentChat.setup.sampleData"),
    services: t("AgentChat.setup.services"),
    status: {
      applied: {
        description: t("AgentChat.setup.status.applied.description"),
        label: t("AgentChat.setup.status.applied.label"),
      },
      cleaned: {
        description: t("AgentChat.setup.status.cleaned.description"),
        label: t("AgentChat.setup.status.cleaned.label"),
      },
      failed: {
        description: t("AgentChat.setup.status.failed.description"),
        label: t("AgentChat.setup.status.failed.label"),
      },
      notEmpty: {
        description: t("AgentChat.setup.status.notEmpty.description"),
        label: t("AgentChat.setup.status.notEmpty.label"),
      },
      partiallyCleaned: {
        description: t("AgentChat.setup.status.partiallyCleaned.description"),
        label: t("AgentChat.setup.status.partiallyCleaned.label"),
      },
      preparing: {
        description: t("AgentChat.setup.status.preparing.description"),
        label: t("AgentChat.setup.status.preparing.label"),
      },
      ready: {
        description: t("AgentChat.setup.status.ready.description"),
        label: t("AgentChat.setup.status.ready.label"),
      },
      superseded: {
        description: t("AgentChat.setup.status.superseded.description"),
        label: t("AgentChat.setup.status.superseded.label"),
      },
    },
    summary: t("AgentChat.setup.summary"),
    tasks: t("AgentChat.setup.tasks"),
    terminology: t("AgentChat.setup.terminology"),
    title: t("AgentChat.setup.title"),
    widgets: t("AgentChat.setup.widgets"),
    sampleDataDetail: (counts: {
      organizations: number;
      contacts: number;
      services: number;
      deals: number;
      tasks: number;
    }) => t("AgentChat.setup.sampleDataDetail", counts),
    cleanupSummary: (summary: {
      deletedResources: number;
      retainedResources: number;
      missingResources: number;
      retainedReasons: ("edited" | "dependent")[];
    }) => {
      const reasons = summary.retainedReasons
        .map((reason) =>
          reason === "edited" ? t("AgentChat.setup.cleanupReasonEdited") : t("AgentChat.setup.cleanupReasonDependent"),
        )
        .join(", ");
      const values = {
        deleted: summary.deletedResources,
        retained: summary.retainedResources,
        missing: summary.missingResources,
      };
      return reasons
        ? t("AgentChat.setup.cleanupSummaryReasons", { ...values, reasons })
        : t("AgentChat.setup.cleanupSummary", values);
    },
    dueInDays: (days: number) => t("AgentChat.setup.dueInDays", { days }),
  };
}

function consecutiveActivityItems(items: AgentChatItem[], start: number) {
  const activities: Extract<AgentChatItem, { kind: "activity" }>[] = [];
  for (let index = start; index < items.length; index += 1) {
    const item = items[index];
    if (item?.kind !== "activity") break;
    activities.push(item);
  }
  return activities;
}

const AgentActivity = observer(function AgentActivity({
  items,
}: {
  items: Extract<AgentChatItem, { kind: "activity" }>[];
}) {
  const locale = useLocale();
  const uiCopy = chatUiCopy(useTranslations());
  const terminology = useAgentActivityTerminology();
  const hasRunning = items.some((item) => item.status === "running");
  const hasError = items.some((item) => item.status === "error");
  const hasCancelled = items.some((item) => item.status === "cancelled");
  const wasRunning = useRef(hasRunning);
  const [open, setOpen] = useState(hasRunning);

  useEffect(() => {
    if (hasRunning || hasError) setOpen(true);
    else if (wasRunning.current) setOpen(false);
    wasRunning.current = hasRunning;
  }, [hasError, hasRunning]);

  const firstCopy = items[0] ? agentActivityCopy(items[0].activity, locale, terminology) : null;
  const summary =
    items.length === 1 && firstCopy
      ? hasRunning
        ? firstCopy.running
        : hasError
          ? firstCopy.error
          : hasCancelled
            ? firstCopy.cancelled
            : firstCopy.done
      : uiCopy.activitySummary(
          hasRunning ? "running" : hasError ? "error" : hasCancelled ? "cancelled" : "complete",
          items.length,
        );

  return (
    <details
      aria-live="off"
      className="group rounded-lg bg-muted/30 px-3 py-2"
      data-testid="agent-activity"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 text-xs text-muted-foreground transition-colors select-none hover:text-foreground [&::-webkit-details-marker]:hidden">
        {hasRunning ? (
          <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
        ) : hasError ? (
          <X aria-hidden="true" className="size-3.5 text-destructive" />
        ) : hasCancelled ? (
          <Square aria-hidden="true" className="size-3.5" />
        ) : (
          <Check aria-hidden="true" className="size-3.5" />
        )}

        <span className="flex-1 text-left">{summary}</span>

        <ChevronDown aria-hidden="true" className="size-3.5 transition-transform group-open:rotate-180" />
      </summary>

      <div className="mt-3 space-y-3 border-l pl-3">
        {items.map((item) => {
          const copy = agentActivityCopy(item.activity, locale, terminology);
          const label =
            item.status === "running"
              ? copy.running
              : item.status === "error"
                ? copy.error
                : item.status === "cancelled"
                  ? copy.cancelled
                  : copy.done;

          return (
            <div key={item.id} className={cn("flex gap-2 text-xs", item.status === "error" && "text-destructive")}>
              {item.status === "running" ? (
                <Loader2 aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 animate-spin" />
              ) : item.status === "error" ? (
                <X aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
              ) : item.status === "cancelled" ? (
                <Square aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
              ) : (
                <Check aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
              )}

              <span className="min-w-0">
                <span className="block text-foreground">{label}</span>

                {copy.detail && <span className="mt-0.5 block text-muted-foreground">{copy.detail}</span>}
              </span>
            </div>
          );
        })}
      </div>
    </details>
  );
});
