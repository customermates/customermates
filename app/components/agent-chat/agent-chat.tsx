"use client";

import { observer } from "mobx-react-lite";
import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { ChevronLeft, History, Maximize2, Minimize2, Plus, Sparkles, X } from "lucide-react";

import { AgentTourOverlay } from "./agent-tour-overlay";

import { usePathname, useRouter } from "@/i18n/navigation";
import { useRootStore } from "@/core/stores/root-store.provider";
import { reportApplicationError } from "@/core/errors/report-application-error";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { IconContainer } from "@/components/shared/icon-container";
import { OVERLAY_SCROLL_REGION } from "@/components/ui/overlay-contract";
import { cn } from "@/core/utils/cn";

import { ActionTooltip, chatUiCopy } from "./chat-ui";
import { AgentComposer, AgentConversationLog } from "./agent-conversation";
import { AgentProgressStatus, AgentStatusAnnouncer } from "./agent-status-announcer";
import { ArchiveUndo, ConversationHistory } from "./conversation-history";
import { SuggestedQuestions } from "./suggested-questions";
import { AgentRouteReloadBridge } from "./agent-route-reload";

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
      <AgentRouteReloadBridge />

      {store.isOpen && (
        <TooltipProvider>
          <AgentChatPanel />
        </TooltipProvider>
      )}

      <AgentStatusAnnouncer />

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
        <AgentConversationLog />
      )}

      <AgentProgressStatus />

      {!store.isHistoryOpen && <AgentComposer />}
    </div>
  );
});
