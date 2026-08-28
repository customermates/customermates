"use client";

import { observer } from "mobx-react-lite";
import { Fragment, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { ArrowUp, ChevronLeft, History, Loader2, Maximize2, Minimize2, Plus, Sparkles, Square, X } from "lucide-react";

import { AgentTourOverlay } from "./agent-tour-overlay";

import { MessageDateSeparator, isSameDay } from "@/app/[locale]/(protected)/inbox/components/message-date-separator";
import { MessagesScrollContainer } from "@/components/scroll/messages-scroll-container";

import { usePathname, useRouter } from "@/i18n/navigation";
import { useRootStore } from "@/core/stores/root-store.provider";
import { reportApplicationError, runUserAction } from "@/core/errors/report-application-error";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { TooltipProvider } from "@/components/ui/tooltip";
import { IconContainer } from "@/components/shared/icon-container";
import { OVERLAY_SCROLL_REGION } from "@/components/ui/overlay-contract";
import { cn } from "@/core/utils/cn";

import { ActionTooltip, chatUiCopy, TypingDots } from "./chat-ui";
import { AgentActivity, AgentChatItemView, consecutiveActivityItems } from "./agent-chat-items";
import { AgentStatusAnnouncer } from "./agent-status-announcer";
import { ArchiveUndo, ConversationHistory } from "./conversation-history";
import { CreditBlockedNotice } from "./credit-blocked-notice";
import { QueuedPrompt } from "./queued-prompt";
import { SuggestedQuestions } from "./suggested-questions";
import { UsageRing } from "./usage-ring";

export const AgentChat = observer(function AgentChat() {
  const { agentChatStore: store, agentUiControlStore } = useRootStore();
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
      timer = setTimeout(() => void load().catch(reportApplicationError), wait);
    };

    if (store.enabled === null) void load().catch(reportApplicationError);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [store]);

  useEffect(() => {
    const pending = pendingNavigationRef.current;
    if (pending && pending.path.split("?")[0] === pathname) {
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
      const targetPathname = path.split("?")[0];
      if (pathnameRef.current === path) return "navigated";
      const accepted = routerRef.current.push(path) as unknown as boolean;
      if (accepted === false) return "blocked";
      if (pathnameRef.current === targetPathname) return "navigated";

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
        ? "nav-assistant"
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
      {store.isOpen && (
        <TooltipProvider>
          <AgentChatPanel />
        </TooltipProvider>
      )}

      <AgentTourOverlay />
    </>
  );
});

const AgentChatPanel = observer(function AgentChatPanel() {
  const { agentChatStore: store, agentUiControlStore } = useRootStore();
  const t = useTranslations();
  const copy = chatUiCopy(t);

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
        "fixed z-40 flex flex-col overflow-hidden rounded-2xl border bg-card",
        "shadow-2xl shadow-black/25 dark:shadow-black/80 dark:ring-1 dark:ring-white/10",
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
        {store.isHistoryOpen && (
          <ActionTooltip label={copy.back}>
            <Button
              aria-label={copy.back}
              className="size-7"
              disabled={Boolean(store.historyMutationPending)}
              id="agent-history-back"
              size="icon"
              variant="ghost"
              onClick={store.toggleHistory}
            >
              <ChevronLeft className="size-4" />
            </Button>
          </ActionTooltip>
        )}

        <span className="mr-auto truncate text-sm font-medium">
          {store.isHistoryOpen ? copy.chats : (store.conversationTitle ?? copy.newChat)}
        </span>

        {!store.isHistoryOpen && (
          <ActionTooltip label={copy.history}>
            <Button
              aria-label={copy.history}
              className="size-7"
              size="icon"
              variant="ghost"
              onClick={store.toggleHistory}
            >
              <History className="size-4" />
            </Button>
          </ActionTooltip>
        )}

        <ActionTooltip label={copy.newChat}>
          <Button
            aria-label={copy.newChat}
            className="size-7"
            disabled={store.isWorking || Boolean(store.historyMutationPending)}
            size="icon"
            variant="ghost"
            onClick={store.newConversation}
          >
            <Plus className="size-4" />
          </Button>
        </ActionTooltip>

        <ActionTooltip label={store.isExpanded ? t("Common.actions.collapse") : t("Common.actions.expand")}>
          <Button
            aria-label={store.isExpanded ? t("Common.actions.collapse") : t("Common.actions.expand")}
            className="size-8"
            size="icon"
            variant="ghost"
            onClick={store.toggleExpanded}
          >
            {store.isExpanded ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          </Button>
        </ActionTooltip>

        <ActionTooltip label={t("Common.actions.close")}>
          <Button
            aria-label={t("Common.actions.close")}
            className="size-8"
            size="icon"
            variant="ghost"
            onClick={store.close}
          >
            <X className="size-4" />
          </Button>
        </ActionTooltip>
      </div>

      {!store.isHistoryOpen && store.lastArchivedConversation && (
        <div className="px-3 pt-2">
          <ArchiveUndo />
        </div>
      )}

      {store.isHistoryOpen ? (
        <ConversationHistory />
      ) : store.items.length === 0 ? (
        <div className={cn(OVERLAY_SCROLL_REGION, "flex flex-col justify-end gap-6 px-6 py-8 text-center")}>
          <article
            aria-label={t("AgentChat.title")}
            className="animate-page-empty-in flex flex-col items-center gap-5 motion-reduce:animate-none"
          >
            <IconContainer icon={Sparkles} size="md" />

            <div className="flex max-w-sm flex-col gap-2">
              <p className="text-base font-medium text-foreground">{t("AgentChat.greeting.headline")}</p>

              <p className="text-sm leading-relaxed text-muted-foreground">{t("AgentChat.greeting.subtitle")}</p>
            </div>
          </article>

          {!blocked && <SuggestedQuestions />}

          <p className="text-xs text-muted-foreground">{t("AgentChat.greeting.support")}</p>
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
                      <ActivityGroup index={index} />
                    )
                  ) : (
                    <AgentChatItemView item={item} />
                  )}
                </Fragment>
              );
            })}

            {store.isAwaitingAssistantResponse && (
              <div aria-label={copy.assistantWorking} className="flex items-center gap-1 py-1" role="status">
                <TypingDots />
              </div>
            )}
          </div>
        </MessagesScrollContainer>
      )}

      <AgentStatusAnnouncer />

      {!store.isHistoryOpen && (
        <div className="px-3 pt-2 pb-3">
          <div className="rounded-xl border border-input bg-card p-2 shadow-xs transition-[color,box-shadow] focus-within:ring-[3px] focus-within:ring-ring/50 focus-within:ring-inset">
            {store.queuedPrompt && <QueuedPrompt />}

            {blocked && usage ? (
              <CreditBlockedNotice usage={usage} />
            ) : (
              <div className="flex items-end gap-2">
                <Textarea
                  aria-label={t("AgentChat.placeholder")}
                  className="max-h-40 min-h-9 flex-1 resize-none border-0 bg-transparent px-1 py-1.5 shadow-none focus-visible:border-0 focus-visible:ring-0"
                  data-testid="agent-composer"
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

                <UsageRing />

                {store.isWorking ? (
                  <ActionTooltip label={t("AgentChat.stop")}>
                    <Button
                      aria-label={t("AgentChat.stop")}
                      className="size-9 shrink-0 rounded-full border-destructive/60 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      size="icon"
                      variant="secondary"
                      onClick={() => runUserAction(() => store.interrupt())}
                    >
                      <Square className="size-3.5" />
                    </Button>
                  </ActionTooltip>
                ) : (
                  <ActionTooltip label={t("AgentChat.send")}>
                    <Button
                      aria-label={t("AgentChat.send")}
                      className="size-9 shrink-0 rounded-full"
                      disabled={!store.composerDraft.trim() || Boolean(store.queuedPrompt)}
                      size="icon"
                      onClick={submit}
                    >
                      <ArrowUp className="size-4" />
                    </Button>
                  </ActionTooltip>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

const ActivityGroup = observer(function ActivityGroup({ index }: { index: number }) {
  const { agentChatStore: store } = useRootStore();
  const items = consecutiveActivityItems(store.items, index);

  return (
    <AgentActivity isTrailing={index + items.length === store.items.length} isWorking={store.isWorking} items={items} />
  );
});
