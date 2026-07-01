"use client";

import type { UIMessage } from "ai";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  lastAssistantMessageIsCompleteWithToolCalls,
} from "ai";
import { useChat } from "@ai-sdk/react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { toast } from "sonner";
import { Check, Copy, FileText, Loader2, MessageSquare, Paperclip, Plus, Send, Square, Trash2, X } from "lucide-react";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useRootStore } from "@/core/stores/root-store.provider";

import { AgentMessageView } from "./agent-message-view";
import { runUiToolClient } from "./run-ui-tool";
import { isUiTool } from "../ui-tools";
import type { AgentPageContext } from "../agent-chat.types";

type ConversationSummary = { id: string; title: string; updatedAt: string };

// A file the user attached, tracked from selection through upload to send. A file
// is only sendable once its upload resolves to a url (status "ready").
type StagedFile = {
  localId: string;
  name: string;
  mime: string;
  sizeBytes: number;
  status: "uploading" | "ready" | "error";
  url?: string;
  id?: string;
  controller?: AbortController;
};

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // keep in sync with upload-store.MAX_UPLOAD_BYTES
const MAX_ATTACHMENTS = 5;

export const AgentChatDrawer = observer(() => {
  const t = useTranslations();
  const pathname = usePathname();
  const router = useRouter();
  const { agentChatStore: store, agentUiControlStore } = useRootStore();

  const addToolResultRef = useRef<((opts: { tool: string; toolCallId: string; output: string }) => void) | null>(null);

  // next-intl's router adds the active locale, so pass an unlocalized path.
  const navigate = useCallback(
    (route: string) => {
      const path = route.startsWith("/") ? route : `/${route}`;
      router.push(path.replace(/^\/(en|de)(?=\/|$)/, "") || "/");
    },
    [router],
  );

  // conversationId + pageContext must ride on EVERY request of a turn, including the
  // SDK's automatic resubmits after a tool result or approval — those go through the
  // transport directly and do NOT carry the per-call sendMessage `body`. Stash the
  // current turn's context in a ref and merge it into every request body below, so an
  // approved run_code turn persists into the active conversation instead of a phantom
  // one keyed by useChat's internal chat id.
  const requestBodyRef = useRef<{ conversationId?: string; pageContext?: AgentPageContext }>({});
  const [transport] = useState(
    () =>
      new DefaultChatTransport<UIMessage>({
        api: "/api/agent",
        prepareSendMessagesRequest: ({ id, messages, trigger, messageId, body }) => ({
          body: { id, messages, trigger, messageId, ...body, ...requestBodyRef.current },
        }),
      }),
  );
  const { messages, sendMessage, status, stop, setMessages, addToolApprovalResponse, addToolResult, error } = useChat({
    transport,
    // Resubmit when a client tool's result is ready OR when the user has
    // approved/rejected a gated tool — the latter is what lets an approved
    // server tool (e.g. run_code) actually execute. Without the approval
    // predicate the turn stalls after approval (no second request fires).
    sendAutomaticallyWhen: (opts) =>
      lastAssistantMessageIsCompleteWithToolCalls(opts) || lastAssistantMessageIsCompleteWithApprovalResponses(opts),
    onToolCall: ({ toolCall }) => {
      if (!isUiTool(toolCall.toolName)) return; // server tools run server-side
      let output: string;
      try {
        output = runUiToolClient(toolCall.toolName, toolCall.input, {
          ui: agentUiControlStore,
          navigate,
        });
      } catch (error) {
        // A throw here (e.g. a client-side schema parse failure) must NOT leave the
        // part at "input-available" — that becomes a dangling tool_use that 400s the
        // next turn. Always send a result, even a failure one.
        output = `UI tool ${toolCall.toolName} failed: ${error instanceof Error ? error.message : String(error)}`;
      }
      addToolResultRef.current?.({ tool: toolCall.toolName, toolCallId: toolCall.toolCallId, output });
    },
  });
  addToolResultRef.current = addToolResult as unknown as (opts: {
    tool: string;
    toolCallId: string;
    output: string;
  }) => void;

  const [input, setInput] = useState("");
  const [files, setFiles] = useState<StagedFile[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Mirror of `files` for imperative cleanup (abort in-flight + reclaim orphaned
  // uploads) without threading `files` into effect/callback dependency arrays.
  const filesRef = useRef<StagedFile[]>([]);
  filesRef.current = files;

  // Abort in-flight uploads and reclaim already-landed (but unsent) bytes server-side
  // so abandoned attachments don't consume the company quota until their 24h TTL.
  const discardStaged = useCallback((items: StagedFile[]) => {
    for (const f of items) {
      f.controller?.abort();
      if (f.id) void fetch(`/api/v1/sandbox/uploads/${f.id}`, { method: "DELETE" }).catch(() => {});
    }
  }, []);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [sessionIdCopied, setSessionIdCopied] = useState(false);
  const loadedConversationRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevStatusRef = useRef(status);

  const isBusy = status === "submitted" || status === "streaming";
  const isUploading = files.some((f) => f.status === "uploading");
  const activeConversationId = store.activeConversationId;

  // A destructive/gated tool is waiting on the user's decision. Typing past it
  // would leave a dangling tool call that wedges the conversation, so we force
  // the choice through the approval card instead.
  const pendingApproval = messages.some((message) =>
    message.parts.some((part) => (part as { state?: string }).state === "approval-requested"),
  );

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
    // Abort any in-flight stream for the previous conversation before we swap the
    // message list — otherwise it keeps appending its assistant reply into the newly
    // selected conversation's transcript (and that leaked history is sent on the next turn).
    void stop();
    // Switching conversations: drop composer state staged for the previous one so
    // attachments/text don't leak onto the newly-opened conversation.
    discardStaged(filesRef.current);
    setFiles([]);
    setInput("");

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
  }, [store.isOpen, store.activeConversationId, setMessages, discardStaged, stop]);

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

  // Transitions an existing staged chip in place — it is NOT a setFiles updater that
  // also performs I/O, so it's safe under StrictMode's double-invoked updaters.
  const uploadFile = useCallback(
    async (localId: string, file: File, signal: AbortSignal) => {
      try {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch("/api/v1/sandbox/uploads", { method: "POST", body: form, signal });
        if (!res.ok) throw new Error(String(res.status));
        const data: { id: string; url: string; mime: string } = await res.json();
        setFiles((prev) =>
          prev.map((f) =>
            f.localId === localId ? { ...f, status: "ready", url: data.url, id: data.id, mime: data.mime } : f,
          ),
        );
      } catch (error) {
        if ((error as { name?: string })?.name === "AbortError") return; // removed mid-flight
        setFiles((prev) => prev.map((f) => (f.localId === localId ? { ...f, status: "error" } : f)));
        toast.error(t("AgentChat.upload.failed"));
      }
    },
    [t],
  );

  const addFiles = useCallback(
    (list: FileList | File[]) => {
      const incoming = Array.from(list);
      if (incoming.length === 0) return;
      const room = MAX_ATTACHMENTS - filesRef.current.length;
      if (room <= 0) {
        toast.error(t("AgentChat.upload.tooMany", { max: MAX_ATTACHMENTS }));
        return;
      }
      const accepted: File[] = [];
      for (const file of incoming) {
        if (accepted.length >= room) {
          toast.error(t("AgentChat.upload.tooMany", { max: MAX_ATTACHMENTS }));
          break;
        }
        if (file.size > MAX_UPLOAD_BYTES) {
          toast.error(t("AgentChat.upload.tooLarge", { name: file.name }));
          continue;
        }
        accepted.push(file);
      }
      if (accepted.length === 0) return;

      const staged: StagedFile[] = [];
      const jobs: Array<{ localId: string; file: File; signal: AbortSignal }> = [];
      for (const file of accepted) {
        const localId = crypto.randomUUID();
        const controller = new AbortController();
        staged.push({
          localId,
          name: file.name,
          mime: file.type || "application/octet-stream",
          sizeBytes: file.size,
          status: "uploading",
          controller,
        });
        jobs.push({ localId, file, signal: controller.signal });
      }
      setFiles((prev) => [...prev, ...staged]);
      jobs.forEach((j) => void uploadFile(j.localId, j.file, j.signal));
    },
    [t, uploadFile],
  );

  const removeFile = useCallback(
    (localId: string) => {
      const target = filesRef.current.find((f) => f.localId === localId);
      if (target) discardStaged([target]);
      setFiles((prev) => prev.filter((f) => f.localId !== localId));
    },
    [discardStaged],
  );

  const submit = useCallback(() => {
    const text = input.trim();
    const ready = files.filter((f) => f.status === "ready" && f.url);
    if ((!text && ready.length === 0) || isBusy || pendingApproval || isUploading) return;

    const conversationId = store.activeConversationId ?? crypto.randomUUID();
    if (!store.activeConversationId) {
      store.setActiveConversation(conversationId);
      // Pre-mark as loaded so the load effect doesn't wipe the optimistic message.
      loadedConversationRef.current = conversationId;
    }

    // Send url-referenced file parts (never base64) plus the text. The server hydrates
    // image/PDF bytes for the model and seeds files into run_code; the persisted
    // message keeps only these lightweight url parts.
    const parts = [
      ...ready.map((f) => ({ type: "file" as const, url: f.url as string, mediaType: f.mime, filename: f.name })),
      ...(text ? [{ type: "text" as const, text }] : []),
    ];

    setInput("");
    setFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
    // Bind this turn's context so it rides on the initial send AND every auto-resubmit.
    requestBodyRef.current = {
      conversationId,
      pageContext: { route: pathname, entity: store.focusedEntity ?? undefined },
    };
    void sendMessage({ role: "user", parts });
  }, [input, files, isBusy, pendingApproval, isUploading, sendMessage, store, pathname]);

  const startNew = useCallback(() => {
    // Abort any in-flight stream so it can't write the previous conversation's reply
    // into the fresh, empty transcript.
    void stop();
    discardStaged(filesRef.current);
    store.startNewConversation();
    loadedConversationRef.current = null;
    setMessages([]);
    setFiles([]);
    setInput("");
    setShowHistory(false);
  }, [store, setMessages, discardStaged, stop]);

  const copySessionId = async (id: string) => {
    try {
      await navigator.clipboard.writeText(id);
      setSessionIdCopied(true);
      toast.success(t("AgentChat.sessionIdCopied"));
      window.setTimeout(() => setSessionIdCopied(false), 2000);
    } catch {
      toast.error(t("AgentChat.error"));
    }
  };

  const deleteConversation = async (id: string) => {
    try {
      await fetch(`/api/agent/conversations/${id}`, { method: "DELETE" });
      if (store.activeConversationId === id) startNew();
      void refreshConversations();
    } catch {
      toast.error(t("AgentChat.error"));
    }
  };

  const alwaysAllow = useCallback(
    async (toolName: string, approvalId: string) => {
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
    },
    [addToolApprovalResponse],
  );

  // Stable reference so the memoized AgentMessageView doesn't re-render every message on
  // each streamed token.
  const handlers = useMemo(
    () => ({
      onApprove: (id: string) => addToolApprovalResponse({ id, approved: true }),
      onReject: (id: string) => addToolApprovalResponse({ id, approved: false }),
      onAlwaysAllow: alwaysAllow,
    }),
    [addToolApprovalResponse, alwaysAllow],
  );

  return (
    <Sheet modal={false} open={store.isOpen} onOpenChange={(open) => (open ? store.open() : store.close())}>
      <SheetContent
        className="w-full gap-0 p-0 shadow-xl sm:max-w-md"
        showOverlay={false}
        side="right"
        onDragLeave={(event) => {
          // Only clear when the pointer actually leaves the drawer, not a child.
          if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
          setDragActive(false);
        }}
        onDragOver={(event) => {
          if (isBusy || pendingApproval) return;
          event.preventDefault();
          setDragActive(true);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragActive(false);
          if (isBusy || pendingApproval) return;
          if (event.dataTransfer.files?.length) addFiles(event.dataTransfer.files);
        }}
        onInteractOutside={(event) => event.preventDefault()}
      >
        {dragActive ? (
          <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center rounded-lg border-2 border-dashed border-primary bg-background/80 text-sm font-medium text-primary">
            {t("AgentChat.upload.dropHint")}
          </div>
        ) : null}

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

        {activeConversationId ? (
          <div className="flex items-center gap-1.5 border-b border-border px-4 py-1.5 text-xs text-muted-foreground">
            <span className="truncate font-mono">
              {t("AgentChat.sessionId", { id: activeConversationId.slice(0, 8) })}
            </span>

            <Button
              className="size-5 shrink-0"
              size="icon-xs"
              title={t("AgentChat.copySessionId")}
              variant="ghost"
              onClick={() => void copySessionId(activeConversationId)}
            >
              {sessionIdCopied ? <Check className="size-3" /> : <Copy className="size-3" />}
            </Button>
          </div>
        ) : null}

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
          {pendingApproval ? (
            <p className="mb-2 text-center text-xs text-amber-700 dark:text-amber-400">
              {t("AgentChat.approvalPending")}
            </p>
          ) : null}

          {files.length > 0 ? (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {files.map((file) => (
                <span
                  key={file.localId}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs",
                    file.status === "error"
                      ? "border-destructive/40 bg-destructive/10 text-destructive"
                      : "border-border bg-muted",
                  )}
                >
                  {file.status === "uploading" ? (
                    <Loader2 className="size-3 shrink-0 animate-spin" />
                  ) : (
                    <FileText className="size-3 shrink-0" />
                  )}

                  <span className="max-w-32 truncate">{file.name}</span>

                  <button
                    className="text-muted-foreground hover:text-foreground"
                    title={t("AgentChat.upload.remove")}
                    type="button"
                    onClick={() => removeFile(file.localId)}
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          ) : null}

          <div className="flex items-end gap-2">
            <input
              ref={fileInputRef}
              multiple
              className="hidden"
              type="file"
              onChange={(event) => {
                if (event.target.files?.length) addFiles(event.target.files);
                event.target.value = "";
              }}
            />

            <Button
              disabled={isBusy || pendingApproval}
              size="icon"
              title={t("AgentChat.upload.attach")}
              variant="ghost"
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip className="size-4" />
            </Button>

            <Textarea
              className="max-h-32 min-h-9 resize-none"
              disabled={isBusy || pendingApproval}
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

            {isBusy ? (
              // While the agent is streaming, the send button becomes a stop button:
              // stop() aborts the in-flight generation (any partial assistant message is
              // repaired by repairDanglingToolCalls on the next turn).
              <Button size="icon" title={t("AgentChat.stop")} variant="destructive" onClick={() => void stop()}>
                <Square className="size-4" />
              </Button>
            ) : (
              <Button
                disabled={pendingApproval || isUploading || (!input.trim() && !files.some((f) => f.status === "ready"))}
                size="icon"
                title={t("AgentChat.send")}
                onClick={submit}
              >
                <Send className="size-4" />
              </Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
});
