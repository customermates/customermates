"use client";

import type { UIMessage } from "ai";

import { useCallback, useEffect, useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { DefaultChatTransport } from "ai";
import { useChat } from "@ai-sdk/react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, MessageSquare, Plus, Send, Trash2 } from "lucide-react";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useRootStore } from "@/core/stores/root-store.provider";

import { AgentMessageView } from "./agent-message-view";

type ConversationSummary = { id: string; title: string; updatedAt: string };

export const AgentChatDrawer = observer(() => {
  const t = useTranslations();
  const pathname = usePathname();
  const { agentChatStore: store } = useRootStore();

  const [transport] = useState(() => new DefaultChatTransport<UIMessage>({ api: "/api/agent" }));
  const { messages, sendMessage, status, setMessages, addToolApprovalResponse, error } = useChat({ transport });

  const [input, setInput] = useState("");
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const loadedConversationRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevStatusRef = useRef(status);

  const isBusy = status === "submitted" || status === "streaming";

  const refreshConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/agent/conversations");
      if (res.ok) setConversations(await res.json());
    } catch {
      /* non-fatal: history list just stays stale */
    }
  }, []);

  // Load the conversation list whenever the drawer is opened.
  useEffect(() => {
    if (store.isOpen) void refreshConversations();
  }, [store.isOpen, refreshConversations]);

  // Load messages when the active conversation changes (e.g. picked from history).
  useEffect(() => {
    if (!store.isOpen) return;
    const id = store.activeConversationId;
    if (id === loadedConversationRef.current) return;
    loadedConversationRef.current = id;

    if (!id) {
      setMessages([]);
      return;
    }

    void (async () => {
      try {
        const res = await fetch(`/api/agent/conversations/${id}`);
        if (!res.ok) {
          setMessages([]);
          return;
        }
        const data = await res.json();
        const loaded: UIMessage[] = (data.messages ?? []).map(
          (m: { id: string; role: string; parts: unknown }) =>
            ({ id: m.id, role: m.role, parts: m.parts }) as UIMessage,
        );
        setMessages(loaded);
      } catch {
        setMessages([]);
      }
    })();
  }, [store.isOpen, store.activeConversationId, setMessages]);

  // Autoscroll to the newest message.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  // Surface stream/route errors (e.g. provider not configured).
  useEffect(() => {
    if (error) toast.error(t("AgentChat.error"));
  }, [error, t]);

  // Refresh the history list when a turn finishes (titles / ordering may change).
  useEffect(() => {
    if (prevStatusRef.current !== "ready" && status === "ready") void refreshConversations();
    prevStatusRef.current = status;
  }, [status, refreshConversations]);

  const submit = useCallback(() => {
    const text = input.trim();
    if (!text || isBusy) return;

    const conversationId = store.activeConversationId ?? crypto.randomUUID();
    if (!store.activeConversationId) {
      store.setActiveConversation(conversationId);
      // Pre-mark as loaded so the load effect doesn't wipe the optimistic message.
      loadedConversationRef.current = conversationId;
    }

    setInput("");
    void sendMessage(
      { text },
      {
        body: {
          conversationId,
          pageContext: { route: pathname, entity: store.focusedEntity ?? undefined },
        },
      },
    );
  }, [input, isBusy, sendMessage, store, pathname]);

  const startNew = useCallback(() => {
    store.startNewConversation();
    loadedConversationRef.current = null;
    setMessages([]);
    setShowHistory(false);
  }, [store, setMessages]);

  const deleteConversation = async (id: string) => {
    try {
      await fetch(`/api/agent/conversations/${id}`, { method: "DELETE" });
      if (store.activeConversationId === id) startNew();
      void refreshConversations();
    } catch {
      toast.error(t("AgentChat.error"));
    }
  };

  const alwaysAllow = async (toolName: string, approvalId: string) => {
    try {
      const res = await fetch("/api/agent/pre-authorized-tools");
      const current = res.ok ? await res.json() : { preAuthorizedToolNames: [] };
      const next = Array.from(new Set([...(current.preAuthorizedToolNames ?? []), toolName]));
      await fetch("/api/agent/pre-authorized-tools", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ toolNames: next }),
      });
    } catch {
      /* non-fatal: approving once still proceeds */
    }
    addToolApprovalResponse({ id: approvalId, approved: true });
  };

  const handlers = {
    onApprove: (id: string) => addToolApprovalResponse({ id, approved: true }),
    onReject: (id: string) => addToolApprovalResponse({ id, approved: false }),
    onAlwaysAllow: alwaysAllow,
  };

  return (
    <Sheet open={store.isOpen} onOpenChange={(open) => (open ? store.open() : store.close())}>
      <SheetContent className="w-full gap-0 p-0 sm:max-w-md" side="right">
        <SheetHeader className="flex-row items-center justify-between border-b border-border">
          <SheetTitle>{t("AgentChat.title")}</SheetTitle>

          <div className="flex items-center gap-1 pr-8">
            <Button
              size="icon-sm"
              title={t("AgentChat.history")}
              variant="ghost"
              onClick={() => setShowHistory((value) => !value)}
            >
              <MessageSquare className="size-4" />
            </Button>

            <Button size="icon-sm" title={t("AgentChat.newChat")} variant="ghost" onClick={startNew}>
              <Plus className="size-4" />
            </Button>
          </div>
        </SheetHeader>

        {showHistory ? (
          <div className="flex-1 overflow-y-auto p-2">
            {conversations.length === 0 ? (
              <p className="p-4 text-center text-sm text-muted-foreground">{t("AgentChat.noConversations")}</p>
            ) : (
              conversations.map((conversation) => (
                <div key={conversation.id} className="flex items-center gap-2 rounded-md p-2 hover:bg-accent">
                  <button
                    className="flex-1 truncate text-left text-sm"
                    onClick={() => {
                      store.setActiveConversation(conversation.id);
                      setShowHistory(false);
                    }}
                  >
                    {conversation.title}
                  </button>

                  <Button
                    size="icon-xs"
                    title={t("AgentChat.delete")}
                    variant="ghost"
                    onClick={() => void deleteConversation(conversation.id)}
                  >
                    <Trash2 className="size-3" />
                  </Button>
                </div>
              ))
            )}
          </div>
        ) : (
          <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4">
            {messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
                <p>{t("AgentChat.empty")}</p>
              </div>
            ) : (
              messages.map((message) => <AgentMessageView key={message.id} handlers={handlers} message={message} />)
            )}

            {status === "submitted" ? (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="size-3 animate-spin" />

                {t("AgentChat.thinking")}
              </div>
            ) : null}
          </div>
        )}

        <div className="border-t border-border p-3">
          <div className="flex items-end gap-2">
            <Textarea
              className="max-h-32 min-h-9 resize-none"
              disabled={isBusy}
              placeholder={t("AgentChat.inputPlaceholder")}
              rows={1}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  submit();
                }
              }}
            />

            <Button disabled={isBusy || !input.trim()} size="icon" title={t("AgentChat.send")} onClick={submit}>
              {isBusy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
});
