import { makeObservable, observable, action, computed, runInAction } from "mobx";

import type { RootStore } from "@/core/stores/root.store";
import type { AgentUsageSummary } from "@/features/agent-chat/agent-usage.service";
import type { AgentConversationSummary, AgentDataCounts } from "@/features/agent-chat/agent-chat.schema";
import { AgentWorkspaceSetupCleanupSummarySchema } from "@/features/agent-chat/agent-chat.schema";
import { AgentTourSchema } from "@/features/agent-chat/agent-tours";
import {
  PrepareAgentWorkspaceSetupSchema,
  AgentWorkspaceSetupPlanSchema,
  agentWorkspaceSetupCounts,
  buildAgentWorkspaceSetupPlan,
  hashAgentWorkspaceSetupPlan,
  type AgentWorkspaceSetupPlan,
  type PrepareAgentWorkspaceSetupData,
} from "@/features/agent-chat/agent-workspace-setup";
import {
  AgentActivityDescriptorSchema,
  AGENT_ACTIVITY_RESOURCES,
  describeAgentTool,
  type AgentActivityDescriptor,
  type AgentActivityResource,
} from "@/features/agent-chat/agent-activity";
import { agentPageState, agentActionPageFromPathname } from "@/features/agent-chat/agent-page-actions";

import { BaseStore } from "@/core/base/base.store";

import {
  applyAgentWorkspaceSetupAction,
  getAgentConfigAction,
  getAgentConversationAction,
  archiveAgentConversationAction,
  cleanupAgentWorkspaceSetupAction,
  deleteAgentConversationAction,
  listAgentConversationsAction,
  markAgentConversationReadAction,
  restoreAgentConversationAction,
  respondToApprovalAction,
  respondToUiCommandAction,
} from "./actions";
import { appLocaleOrDefault } from "@/i18n/locale-registry";

export type AgentChatItem =
  | { kind: "user"; id: string; messageId: string; text: string; at?: Date }
  | {
      kind: "assistant";
      id: string;
      messageId?: string;
      text: string;
      streaming: boolean;
      at?: Date;
    }
  | { kind: "support"; id: string; text: string; at?: Date }
  | {
      kind: "turn_error";
      id: string;
      messageId: string;
      text: string;
      pageRoute: string;
      retry?: boolean;
      at?: Date;
    }
  | {
      kind: "activity";
      id: string;
      providerCallId?: string;
      turnKey?: string;
      activity: AgentActivityDescriptor;
      status: "running" | "done" | "error" | "cancelled";
      at?: Date;
    }
  | {
      kind: "approval";
      id: string;
      requestId: string;
      activity: AgentActivityDescriptor;
      resolution: "approve" | "reject" | "timeout" | null;
      pendingDecision: "approve" | "reject" | null;
      at?: Date;
    }
  | {
      kind: "workspace_setup";
      id: string;
      commandId: string;
      turnKey?: string;
      setup: PrepareAgentWorkspaceSetupData;
      plan: AgentWorkspaceSetupPlan;
      planHash: string;
      setupId?: string;
      status: "preparing" | "ready" | "superseded" | "applied" | "partiallyCleaned" | "cleaned" | "notEmpty" | "failed";
      pendingAction?: "apply" | "safeCleanup" | "fullCleanup" | null;
      errorAction?: "apply" | "safeCleanup" | "fullCleanup" | null;
      cleanupSummary?: {
        deletedResources: number;
        retainedResources: number;
        missingResources: number;
        retainedReasons: ("edited" | "dependent")[];
      };
      at?: Date;
    };

let itemSeq = 0;
const nextItemId = () => `item-${++itemSeq}`;
const UI_COMMAND_NAMES = ["navigate", "highlight_element", "start_tour", "open_workspace_setup"] as const;
const AGENT_TURN_POLL_MAX_ATTEMPTS = 100;
const AGENT_TURN_POLL_DELAY_MS = 1500;
const AGENT_CONFIG_LOAD_TIMEOUT_MS = 15000;
type UiCommandName = (typeof UI_COMMAND_NAMES)[number];
export type AgentConfigLoadStatus = "ready" | "disabled" | "retry";

async function withDeadline<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("The assistant configuration request timed out.")), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function appendDistinctConversations(
  existing: AgentConversationSummary[],
  additions: AgentConversationSummary[],
): AgentConversationSummary[] {
  const existingIds = new Set(existing.map((conversation) => conversation.id));
  return [...existing, ...additions.filter((conversation) => !existingIds.has(conversation.id))];
}

function isUiCommandName(value: string): value is UiCommandName {
  return UI_COMMAND_NAMES.some((name) => name === value);
}

export class AgentChatStore extends BaseStore {
  isOpen = false;
  isExpanded = false;
  composerFocusRequested = false;
  enabled: boolean | null = null;
  usage: AgentUsageSummary | null = null;
  counts: AgentDataCounts | null = null;
  conversationId: string | null = null;
  conversations: AgentConversationSummary[] = [];
  archivedConversations: AgentConversationSummary[] = [];
  lastArchivedConversation: AgentConversationSummary | null = null;
  isHistoryOpen = false;
  conversationLoadPendingId: string | null = null;
  conversationLoadError = false;
  historyRefreshError = false;
  historyQuery = "";
  historySearchPending = false;
  conversationNextCursor: string | null = null;
  archivedConversationNextCursor: string | null = null;
  historyLoadMorePending: "active" | "archived" | null = null;
  historyMutationPending: "archive" | "restore" | "delete" | null = null;
  olderMessagesCursor: string | null = null;
  olderMessagesPending = false;
  items: AgentChatItem[] = [];
  composerDraft = "";
  queuedPrompt: string | null = null;
  autoOpenedPages = new Set<string>();
  isWorking = false;
  unreadSupport = 0;
  private abortController: AbortController | null = null;
  private configRequest: Promise<AgentConfigLoadStatus> | null = null;
  private supportRevalidationRequest: Promise<void> | null = null;
  private conversationLoadVersion = 0;
  private isDraftConversationSelected = false;
  private observedSupportMessageByConversation = new Map<string, string>();
  private unreadStateVersion = 0;
  private activeTurnFailed = false;
  private activeTurnCompleted = false;
  private activeTurnDisposition: "stream" | "running" | "failed" | "uncertain" | "conflict" | "transport" = "stream";
  private persistedAssistantMessageIds = new Set<string>();
  private loadedMessageIds = new Set<string>();
  private historyRefreshVersion = 0;
  private queuedPromptMessageId: string | null = null;
  private queuedPromptConversationId: string | null = null;
  private queuedPromptPageRoute: string | null = null;
  private activeStreamKey = "stream-0";
  private streamSequence = 0;

  constructor(rootStore: RootStore) {
    super(rootStore);
    makeObservable(this, {
      isOpen: observable,
      isExpanded: observable,
      enabled: observable,
      usage: observable.ref,
      counts: observable.ref,
      conversationId: observable,
      conversations: observable,
      archivedConversations: observable,
      lastArchivedConversation: observable.ref,
      isHistoryOpen: observable,
      conversationLoadPendingId: observable,
      conversationLoadError: observable,
      historyRefreshError: observable,
      historyQuery: observable,
      historySearchPending: observable,
      conversationNextCursor: observable,
      archivedConversationNextCursor: observable,
      historyLoadMorePending: observable,
      historyMutationPending: observable,
      olderMessagesCursor: observable,
      olderMessagesPending: observable,
      items: observable,
      composerDraft: observable,
      queuedPrompt: observable,
      isWorking: observable,
      unreadSupport: observable,
      composerFocusRequested: observable,
      isWorkspaceSetupPending: computed,
      open: action,
      consumeComposerFocus: action,
      close: action,
      toggleExpanded: action,
      setComposerDraft: action,
      editWorkspaceSetup: action,
      submitDraft: action,
      openForEmptyPage: action,
      editQueuedPrompt: action,
      removeQueuedPrompt: action,
      retryFailedTurn: action,
      newConversation: action,
      toggleHistory: action,
    });
  }

  open = () => {
    this.isOpen = true;
    this.composerFocusRequested = true;
    void this.revalidateSupportReplies();
  };

  consumeComposerFocus = () => {
    this.composerFocusRequested = false;
  };

  get isWorkspaceSetupPending() {
    return this.items.some((item) => item.kind === "workspace_setup" && Boolean(item.pendingAction));
  }

  close = () => {
    this.isOpen = false;
  };

  toggleExpanded = () => {
    this.isExpanded = !this.isExpanded;
  };

  toggleHistory = () => {
    const opening = !this.isHistoryOpen;
    this.isHistoryOpen = opening;
    if (opening) void this.refreshConversations();
    if (!this.isHistoryOpen && this.conversationId) void this.markConversationRead(this.conversationId);
  };

  newConversation = () => {
    if (this.isWorking || this.isWorkspaceSetupPending || this.historyMutationPending) return;
    this.beginNewConversation();
  };

  private beginNewConversation() {
    this.resetConversation(null);
    this.isDraftConversationSelected = true;
    this.composerDraft = "";
    this.isHistoryOpen = false;
  }

  openForEmptyPage = (pathname: string) => {
    if (!this.enabled || this.isOpen || this.autoOpenedPages.has(pathname)) return;
    if (!this.counts) return;

    const page = agentActionPageFromPathname(pathname);
    if (!page || agentPageState(page, this.counts) !== "empty") return;

    this.autoOpenedPages.add(pathname);
    this.isOpen = true;
  };

  setComposerDraft = (value: string) => {
    if (this.isWorkspaceSetupPending) return;
    this.composerDraft = value;
  };

  editWorkspaceSetup = (prompt: string) => {
    if (this.isWorkspaceSetupPending) return;
    this.composerDraft = prompt;
    this.isHistoryOpen = false;
  };

  applyWorkspaceSetup = async (item: Extract<AgentChatItem, { kind: "workspace_setup" }>) => {
    if (
      !this.conversationId ||
      this.isWorking ||
      this.isWorkspaceSetupPending ||
      item.status !== "ready" ||
      item.pendingAction
    )
      return;

    runInAction(() => {
      item.pendingAction = "apply";
      item.errorAction = null;
    });
    try {
      const result = await applyAgentWorkspaceSetupAction({
        conversationId: this.conversationId,
        commandId: item.commandId,
        planHash: item.planHash,
      });
      if (!result?.ok) throw new Error("Workspace setup could not be applied.");
      if (result.data.status === "notEmpty") {
        runInAction(() => {
          item.status = "notEmpty";
          delete item.setupId;
        });
      } else {
        if (!result.data.setupId) throw new Error("Workspace setup identity is missing.");
        runInAction(() => {
          item.status = "applied";
          item.setupId = result.data.setupId ?? undefined;
          delete item.cleanupSummary;
        });
      }
      await this.refreshAffectedResources([
        "contacts",
        "organizations",
        "deals",
        "services",
        "tasks",
        "widgets",
        "terminology",
      ]);
      await this.loadConfig();
    } catch {
      runInAction(() => {
        item.errorAction = "apply";
      });
      this.toastError("AgentChat.errors.sendFailed");
    } finally {
      runInAction(() => {
        item.pendingAction = null;
      });
    }
  };

  cleanupWorkspaceSetup = async (item: Extract<AgentChatItem, { kind: "workspace_setup" }>, mode: "safe" | "full") => {
    const canSafelyClean = mode === "safe" && item.status === "applied";
    const canFullyClean =
      mode === "full" &&
      item.status === "partiallyCleaned" &&
      Boolean(item.cleanupSummary?.retainedReasons.includes("edited"));
    if (
      !this.conversationId ||
      !item.setupId ||
      this.isWorking ||
      this.isWorkspaceSetupPending ||
      item.pendingAction ||
      (!canSafelyClean && !canFullyClean)
    )
      return;

    const priorStatus = item.status;
    const pendingAction = mode === "safe" ? "safeCleanup" : "fullCleanup";
    runInAction(() => {
      item.pendingAction = pendingAction;
      item.errorAction = null;
    });
    try {
      const result = await cleanupAgentWorkspaceSetupAction({
        conversationId: this.conversationId,
        setupId: item.setupId,
        planHash: item.planHash,
        mode,
      });
      if (!result?.ok || result.data.setupId !== item.setupId)
        throw new Error("Workspace setup cleanup identity does not match.");

      runInAction(() => {
        item.status = result.data.status === "partiallyCleaned" ? "partiallyCleaned" : "cleaned";
        item.cleanupSummary = {
          deletedResources: result.data.deletedResources,
          retainedResources: result.data.retainedResources,
          missingResources: result.data.missingResources,
          retainedReasons: result.data.retainedReasons,
        };
      });
      await this.refreshAffectedResources([
        "contacts",
        "organizations",
        "deals",
        "services",
        "tasks",
        "widgets",
        "terminology",
      ]);
      await this.loadConfig();
    } catch {
      runInAction(() => {
        item.status = priorStatus;
        item.errorAction = pendingAction;
      });
      this.toastError("AgentChat.errors.sendFailed");
    } finally {
      runInAction(() => {
        item.pendingAction = null;
      });
    }
  };

  submitDraft = () => {
    if (this.isWorkspaceSetupPending) return;
    const text = this.composerDraft.trim();
    if (!text) return;
    if (this.isWorking) {
      if (this.queuedPrompt) return;
      this.queuedPrompt = text;
      this.queuedPromptMessageId = globalThis.crypto.randomUUID();
      this.queuedPromptConversationId = this.conversationId;
      this.queuedPromptPageRoute = typeof window === "undefined" ? "/" : window.location.pathname;
      this.composerDraft = "";
      return;
    }
    this.isOpen = true;
    this.composerDraft = "";
    void this.sendMessage(text);
  };

  editQueuedPrompt = () => {
    if (!this.queuedPrompt || this.isWorkspaceSetupPending) return;
    this.composerDraft = this.queuedPrompt;
    this.queuedPrompt = null;
    this.queuedPromptMessageId = null;
    this.queuedPromptConversationId = null;
    this.queuedPromptPageRoute = null;
  };

  removeQueuedPrompt = () => {
    this.queuedPrompt = null;
    this.queuedPromptMessageId = null;
    this.queuedPromptConversationId = null;
    this.queuedPromptPageRoute = null;
  };

  retryFailedTurn = (item: Extract<AgentChatItem, { kind: "turn_error" }>) => {
    if (this.isWorking || this.isWorkspaceSetupPending || this.usage?.blockedReason) return;
    if (!this.canRetryFailedTurn(item)) return;
    let userIndex = -1;
    for (let index = this.items.length - 1; index >= 0; index -= 1) {
      const candidate = this.items[index];
      if (candidate?.kind === "user" && candidate.messageId === item.messageId) {
        userIndex = index;
        break;
      }
    }
    this.items =
      userIndex >= 0 ? this.items.slice(0, userIndex + 1) : this.items.filter((candidate) => candidate.id !== item.id);
    void this.sendMessage(item.text, {
      appendUser: false,
      messageId: item.messageId,
      pageRoute: item.pageRoute,
      retry: Boolean(item.retry),
    });
  };

  canRetryFailedTurn = (item: Extract<AgentChatItem, { kind: "turn_error" }>) => this.items.at(-1)?.id === item.id;

  private stopStream() {
    this.abortController?.abort();
    this.abortController = null;
  }

  private resetConversation(id: string | null) {
    this.conversationLoadVersion += 1;
    this.stopStream();
    this.conversationId = id;
    this.items = [];
    this.persistedAssistantMessageIds.clear();
    this.loadedMessageIds.clear();
    this.queuedPrompt = null;
    this.queuedPromptMessageId = null;
    this.queuedPromptConversationId = null;
    this.queuedPromptPageRoute = null;
    this.isWorking = false;
    this.conversationLoadPendingId = null;
    this.conversationLoadError = false;
    this.olderMessagesCursor = null;
    this.olderMessagesPending = false;
  }

  selectConversation = async (id: string) => {
    if (this.isWorking || this.isWorkspaceSetupPending || this.historyMutationPending) return;
    if (this.conversationId === id && !this.conversationLoadError) {
      const current = this.conversations.find((conversation) => conversation.id === id);
      if (current?.unreadSupport) {
        await this.loadConversation(id);
        return;
      }
      runInAction(() => {
        this.isHistoryOpen = false;
      });
      return;
    }
    await this.loadConversation(id);
  };

  private loadConversation = async (id: string) => {
    runInAction(() => {
      this.conversationLoadVersion += 1;
      this.stopStream();
      this.conversationLoadPendingId = id;
      this.conversationLoadError = false;
      this.olderMessagesCursor = null;
      this.olderMessagesPending = false;
    });
    const loadVersion = this.conversationLoadVersion;

    try {
      const data = await getAgentConversationAction(id);
      if (!data) throw new Error("Conversation could not be loaded.");
      if (loadVersion !== this.conversationLoadVersion || this.conversationLoadPendingId !== id) return;

      runInAction(() => {
        this.conversationId = id;
        this.items = [];
        this.persistedAssistantMessageIds.clear();
        this.loadedMessageIds.clear();
        this.isWorking = false;
        this.isDraftConversationSelected = false;
        this.conversationLoadPendingId = null;
        this.isHistoryOpen = false;
        this.olderMessagesCursor = data.nextCursor;
        const observedSupport = [...data.messages].reverse().find((message) => message.role === "support");
        if (observedSupport) this.observedSupportMessageByConversation.set(id, observedSupport.id);
        else this.observedSupportMessageByConversation.delete(id);
        this.appendMessages(data.messages);
      });
      if (this.isOpen) await this.markConversationRead(id);
    } catch {
      if (loadVersion !== this.conversationLoadVersion) return;
      runInAction(() => {
        this.conversationLoadPendingId = null;
        this.conversationLoadError = true;
      });
    }
  };

  loadOlderMessages = async () => {
    const conversationId = this.conversationId;
    const before = this.olderMessagesCursor;
    if (!conversationId || !before || this.olderMessagesPending || this.conversationLoadPendingId) return;
    const loadVersion = this.conversationLoadVersion;
    runInAction(() => {
      this.olderMessagesPending = true;
    });

    try {
      const data = await getAgentConversationAction(conversationId, before);
      if (!data || loadVersion !== this.conversationLoadVersion || this.conversationId !== conversationId) return;
      const observedSupport = [...data.messages].reverse().find((message) => message.role === "support");
      runInAction(() => {
        const existing = this.items;
        this.items = [];
        this.appendMessages(data.messages);
        this.items = [...this.items, ...existing];
        this.normalizeWorkspaceSetups();
        this.olderMessagesCursor = data.nextCursor;
        if (observedSupport && !this.observedSupportMessageByConversation.has(conversationId))
          this.observedSupportMessageByConversation.set(conversationId, observedSupport.id);
      });
      if (observedSupport && this.isOpen) await this.markConversationRead(conversationId);
    } catch {
      this.toastError("AgentChat.errors.sendFailed");
    } finally {
      if (loadVersion === this.conversationLoadVersion) {
        runInAction(() => {
          this.olderMessagesPending = false;
        });
      }
    }
  };

  private appendMessages(
    messages: readonly {
      id: string;
      role: string;
      parts: unknown;
      createdAt?: Date | string | null;
    }[],
  ) {
    for (const message of messages) {
      if (this.loadedMessageIds.has(message.id)) continue;
      this.loadedMessageIds.add(message.id);
      const at = message.createdAt ? new Date(message.createdAt) : undefined;
      const parts = (Array.isArray(message.parts) ? message.parts : []) as {
        type: string;
        text?: string;
        id?: string;
        name?: string;
        status?: string;
        input?: unknown;
        activity?: unknown;
        setup?: unknown;
        plan?: unknown;
        planHash?: unknown;
        cleanupSummary?: unknown;
        setupId?: unknown;
      }[];
      for (const part of parts) this.appendPart(message.role, part, at, message.id);
      if (message.role === "assistant") this.persistedAssistantMessageIds.add(message.id);
    }
    this.normalizeWorkspaceSetups();
  }

  private normalizeWorkspaceSetups() {
    const actionable = this.items.filter(
      (item): item is Extract<AgentChatItem, { kind: "workspace_setup" }> =>
        item.kind === "workspace_setup" &&
        (item.status === "preparing" || item.status === "ready" || item.status === "failed"),
    );
    const latest = actionable.at(-1);
    for (const item of actionable) if (item !== latest) item.status = "superseded";
  }

  private markConversationRead = async (id: string) => {
    try {
      const result = await markAgentConversationReadAction({
        conversationId: id,
        observedSupportMessageId: this.observedSupportMessageByConversation.get(id),
      });
      if (!result?.ok) return;
      runInAction(() => {
        this.unreadStateVersion += 1;
        const summary = this.conversations.find((conversation) => conversation.id === id);
        if (summary) summary.unreadSupport = result.data.unreadSupport;
        this.unreadSupport = result.data.unreadSupportCount;
      });
    } catch {}
  };

  private appendPart(
    role: string,
    part: {
      type: string;
      text?: string;
      id?: string;
      name?: string;
      status?: string;
      input?: unknown;
      activity?: unknown;
      setup?: unknown;
      plan?: unknown;
      planHash?: unknown;
      cleanupSummary?: unknown;
      setupId?: unknown;
    },
    at?: Date,
    messageId?: string,
  ) {
    if (part.type === "text" && part.text) {
      if (role === "user") {
        const id = nextItemId();
        this.items.push({
          kind: "user",
          id,
          messageId: messageId ?? id,
          text: part.text,
          at,
        });
      } else if (role === "support") {
        this.items.push({
          kind: "support",
          id: nextItemId(),
          text: part.text,
          at,
        });
      } else {
        this.items.push({
          kind: "assistant",
          id: nextItemId(),
          ...(messageId ? { messageId } : {}),
          text: part.text,
          streaming: false,
          at,
        });
      }
    } else if (part.type === "activity" && part.id) {
      const activity = AgentActivityDescriptorSchema.safeParse(part.activity);
      if (!activity.success) return;
      this.items.push({
        kind: "activity",
        id: nextItemId(),
        providerCallId: part.id,
        ...(messageId ? { turnKey: `message-${messageId}` } : {}),
        activity: activity.data,
        status:
          part.status === "running"
            ? "running"
            : part.status === "error"
              ? "error"
              : part.status === "cancelled"
                ? "cancelled"
                : "done",
        at,
      });
    } else if (part.type === "approval" && part.id) {
      const activity = AgentActivityDescriptorSchema.safeParse(part.activity);
      if (!activity.success) return;
      this.items.push({
        kind: "approval",
        id: `approval-${part.id}`,
        requestId: part.id,
        activity: activity.data,
        pendingDecision: null,
        resolution:
          part.status === "approved"
            ? "approve"
            : part.status === "rejected"
              ? "reject"
              : part.status === "timeout" || part.status === "cancelled"
                ? "timeout"
                : null,
        at,
      });
    } else if (part.type === "workspace_setup" && part.id) {
      const setup = PrepareAgentWorkspaceSetupSchema.safeParse(part.setup);
      const plan = AgentWorkspaceSetupPlanSchema.safeParse(part.plan);
      const cleanupSummary = AgentWorkspaceSetupCleanupSummarySchema.safeParse(part.cleanupSummary);
      if (!setup.success || !plan.success || typeof part.planHash !== "string") return;
      const status = [
        "preparing",
        "ready",
        "superseded",
        "applied",
        "partiallyCleaned",
        "cleaned",
        "notEmpty",
        "failed",
      ].includes(part.status ?? "")
        ? (part.status as Extract<AgentChatItem, { kind: "workspace_setup" }>["status"])
        : "failed";
      this.items.push({
        kind: "workspace_setup",
        id: nextItemId(),
        commandId: part.id,
        ...(messageId ? { turnKey: `message-${messageId}` } : {}),
        setup: setup.data,
        plan: plan.data,
        planHash: part.planHash,
        ...(typeof part.setupId === "string" ? { setupId: part.setupId } : {}),
        status,
        ...(cleanupSummary.success ? { cleanupSummary: cleanupSummary.data } : {}),
        at,
      });
    } else if (part.type === "tool_use" && part.id && part.name) {
      this.items.push({
        kind: "activity",
        id: nextItemId(),
        providerCallId: part.id,
        ...(messageId ? { turnKey: `message-${messageId}` } : {}),
        activity: describeAgentTool(part.name, part.input),
        status:
          part.status === "running"
            ? "running"
            : part.status === "error"
              ? "error"
              : part.status === "cancelled"
                ? "cancelled"
                : "done",
        at,
      });
    }
  }

  interrupt = () => {
    const activeController = this.abortController;
    activeController?.abort();
    runInAction(() => {
      if (activeController) this.markActiveTurnStopped();
      if (!activeController) this.isWorking = false;
      this.clearStreaming();
      for (const item of this.items)
        if (item.kind === "activity" && item.status === "running") item.status = "cancelled";
    });
  };

  private markActiveTurnStopped() {
    const stopped = this.t("AgentChat.runner.cancelled");
    let currentAssistant: Extract<AgentChatItem, { kind: "assistant" }> | null = null;
    for (let index = this.items.length - 1; index >= 0; index -= 1) {
      const item = this.items[index];
      if (item?.kind === "user") break;
      if (item?.kind === "assistant" && item.streaming) {
        currentAssistant = item;
        break;
      }
    }

    if (currentAssistant) {
      currentAssistant.text = currentAssistant.text.trim() ? `${currentAssistant.text}\n\n${stopped}` : stopped;
      currentAssistant.streaming = false;
      return;
    }

    this.items.push({
      kind: "assistant",
      id: nextItemId(),
      text: stopped,
      streaming: false,
      at: new Date(),
    });
  }

  private clearStreaming = () => {
    for (const item of this.items) if (item.kind === "assistant") item.streaming = false;
  };

  loadConfig = () => {
    if (this.configRequest) return this.configRequest;

    const request = this.loadConfigOnce().finally(() => {
      if (this.configRequest === request) this.configRequest = null;
    });
    this.configRequest = request;
    return request;
  };

  private loadConfigOnce = async (): Promise<AgentConfigLoadStatus> => {
    const unreadVersion = this.unreadStateVersion;
    try {
      const response = await withDeadline(getAgentConfigAction(), AGENT_CONFIG_LOAD_TIMEOUT_MS);
      if (!response.enabled) {
        runInAction(() => {
          this.enabled = false;
        });
        return "disabled";
      }
      const config = response.config;
      if (!config) return "retry";

      runInAction(() => {
        const preserveUnread = unreadVersion !== this.unreadStateVersion;
        const preserveExactHistory = Boolean(this.historyQuery) || Boolean(this.historyMutationPending);
        const preserveLoadedPages = preserveExactHistory || this.isHistoryOpen;
        const currentUnread = new Map(
          this.conversations.map((conversation) => [conversation.id, conversation.unreadSupport]),
        );
        const conversations = (config.conversations ?? []).map((conversation) => ({
          ...conversation,
          unreadSupport:
            preserveUnread && currentUnread.has(conversation.id)
              ? (currentUnread.get(conversation.id) ?? false)
              : conversation.unreadSupport,
          updatedAt: new Date(conversation.updatedAt),
        }));
        const archivedConversations = (config.archivedConversations ?? []).map((conversation) => ({
          ...conversation,
          updatedAt: new Date(conversation.updatedAt),
        }));
        this.enabled = true;
        this.usage = config.usage;
        if (!preserveUnread) this.unreadSupport = config.unreadSupport;
        this.counts = config.counts;
        if (preserveExactHistory) {
          const activeById = new Map(conversations.map((conversation) => [conversation.id, conversation]));
          const archivedById = new Map(archivedConversations.map((conversation) => [conversation.id, conversation]));
          this.conversations = this.conversations.map(
            (conversation) => activeById.get(conversation.id) ?? conversation,
          );
          this.archivedConversations = this.archivedConversations.map(
            (conversation) => archivedById.get(conversation.id) ?? conversation,
          );
        } else if (preserveLoadedPages) {
          this.conversations = appendDistinctConversations(conversations, this.conversations);
          this.archivedConversations = appendDistinctConversations(archivedConversations, this.archivedConversations);
        } else {
          this.conversations = conversations;
          this.archivedConversations = archivedConversations;
          this.conversationNextCursor = config.conversationNextCursor ?? null;
          this.archivedConversationNextCursor = config.archivedConversationNextCursor ?? null;
          this.historyRefreshError = false;
        }
      });
      if (!this.conversationId && !this.isDraftConversationSelected && config.conversationId)
        await this.loadConversation(config.conversationId);
      return "ready";
    } catch {
      return "retry";
    }
  };

  revalidateSupportReplies = () => {
    if (this.supportRevalidationRequest) return this.supportRevalidationRequest;

    const request = this.revalidateSupportRepliesOnce().finally(() => {
      if (this.supportRevalidationRequest === request) this.supportRevalidationRequest = null;
    });
    this.supportRevalidationRequest = request;
    return request;
  };

  private revalidateSupportRepliesOnce = async () => {
    const status = await this.loadConfig();
    if (status !== "ready") return;

    const conversationId = this.conversationId;
    if (
      !conversationId ||
      !this.isOpen ||
      this.isHistoryOpen ||
      this.isWorking ||
      this.isWorkspaceSetupPending ||
      this.historyMutationPending ||
      this.conversationLoadPendingId
    )
      return;

    const conversation = this.conversations.find((candidate) => candidate.id === conversationId);
    if (conversation?.unreadSupport) await this.loadConversation(conversationId);
  };

  refreshConversations = async (query = this.historyQuery) => {
    const refreshVersion = ++this.historyRefreshVersion;
    const normalizedQuery = query.trim();
    runInAction(() => {
      this.historyQuery = normalizedQuery;
      this.historySearchPending = true;
      this.historyLoadMorePending = null;
    });
    try {
      const result = await listAgentConversationsAction({
        query: normalizedQuery,
        kind: "both",
      });
      const active = result?.active;
      const archived = result?.archived;
      if (!active || !archived) throw new Error("Conversation history could not be refreshed.");
      if (refreshVersion !== this.historyRefreshVersion) return;
      runInAction(() => {
        this.conversations = active.conversations.map((conversation) => ({
          ...conversation,
          updatedAt: new Date(conversation.updatedAt),
        }));
        this.archivedConversations = archived.conversations.map((conversation) => ({
          ...conversation,
          updatedAt: new Date(conversation.updatedAt),
        }));
        this.conversationNextCursor = active.nextCursor;
        this.archivedConversationNextCursor = archived.nextCursor;
        this.historyRefreshError = false;
        this.historySearchPending = false;
      });
    } catch {
      if (refreshVersion !== this.historyRefreshVersion) return;
      runInAction(() => {
        this.historyRefreshError = true;
        this.historySearchPending = false;
      });
    }
  };

  loadMoreConversations = async (kind: "active" | "archived") => {
    const cursor = kind === "active" ? this.conversationNextCursor : this.archivedConversationNextCursor;
    if (!cursor || this.historyLoadMorePending || this.historySearchPending || this.historyMutationPending) return;
    const refreshVersion = this.historyRefreshVersion;
    runInAction(() => {
      this.historyLoadMorePending = kind;
    });

    try {
      const result = await listAgentConversationsAction({
        query: this.historyQuery,
        kind,
        cursor,
      });
      const page = kind === "active" ? result?.active : result?.archived;
      if (!page || refreshVersion !== this.historyRefreshVersion) return;
      runInAction(() => {
        const mapped = page.conversations.map((conversation) => ({
          ...conversation,
          updatedAt: new Date(conversation.updatedAt),
        }));
        if (kind === "active") {
          this.conversations = appendDistinctConversations(this.conversations, mapped);
          this.conversationNextCursor = page.nextCursor;
        } else {
          this.archivedConversations = appendDistinctConversations(this.archivedConversations, mapped);
          this.archivedConversationNextCursor = page.nextCursor;
        }
      });
    } catch {
      if (refreshVersion === this.historyRefreshVersion) {
        runInAction(() => {
          this.historyRefreshError = true;
        });
      }
    } finally {
      if (refreshVersion === this.historyRefreshVersion) {
        runInAction(() => {
          this.historyLoadMorePending = null;
        });
      }
    }
  };

  archiveConversation = async (id: string) => {
    if (this.isWorking || this.isWorkspaceSetupPending || this.historyMutationPending || this.conversationLoadPendingId)
      return false;
    const archivedConversation = this.conversations.find((conversation) => conversation.id === id) ?? null;
    runInAction(() => {
      this.historyMutationPending = "archive";
    });
    try {
      const result = await archiveAgentConversationAction({
        conversationId: id,
      });
      if (!result?.ok) throw new Error();
      this.historyRefreshVersion += 1;
      const conversations = result.data.conversations.map((conversation) => ({
        ...conversation,
        updatedAt: new Date(conversation.updatedAt),
      }));
      runInAction(() => {
        this.historySearchPending = false;
        this.historyLoadMorePending = null;
        this.conversations = conversations;
        this.conversationNextCursor = result.data.nextCursor;
        this.lastArchivedConversation = archivedConversation;
        if (archivedConversation) {
          this.archivedConversations = [
            { ...archivedConversation, updatedAt: new Date() },
            ...this.archivedConversations.filter((conversation) => conversation.id !== id),
          ];
        }
      });
      if (this.conversationId === id) {
        const fallback = result.data.activeConversationId;
        if (fallback) await this.loadConversation(fallback);
        else runInAction(() => this.beginNewConversation());
      }
      await this.loadConfig();
      if (this.historyQuery) await this.refreshConversations(this.historyQuery);
      return true;
    } catch {
      this.toastError("AgentChat.errors.sendFailed");
      return false;
    } finally {
      runInAction(() => {
        this.historyMutationPending = null;
      });
    }
  };

  restoreLastArchivedConversation = async () => {
    const archived = this.lastArchivedConversation;
    if (!archived || this.isWorking || this.isWorkspaceSetupPending || this.historyMutationPending) return;

    await this.restoreArchivedConversation(archived.id);
  };

  restoreArchivedConversation = async (id: string) => {
    if (this.isWorking || this.isWorkspaceSetupPending || this.historyMutationPending || this.conversationLoadPendingId)
      return false;

    runInAction(() => {
      this.historyMutationPending = "restore";
    });
    try {
      const result = await restoreAgentConversationAction({
        conversationId: id,
      });
      if (!result?.ok) throw new Error();
      this.historyRefreshVersion += 1;
      const conversations = result.data.conversations.map((conversation) => ({
        ...conversation,
        updatedAt: new Date(conversation.updatedAt),
      }));
      runInAction(() => {
        this.historySearchPending = false;
        this.historyLoadMorePending = null;
        this.conversations = conversations;
        this.conversationNextCursor = result.data.nextCursor;
        this.archivedConversations = this.archivedConversations.filter((conversation) => conversation.id !== id);
        if (this.lastArchivedConversation?.id === id) this.lastArchivedConversation = null;
      });
      await this.loadConversation(result.data.activeConversationId);
      if (this.historyQuery) await this.refreshConversations(this.historyQuery);
      return true;
    } catch {
      this.toastError("AgentChat.errors.sendFailed");
      return false;
    } finally {
      runInAction(() => {
        this.historyMutationPending = null;
      });
    }
  };

  deleteArchivedConversation = async (id: string) => {
    if (this.isWorking || this.isWorkspaceSetupPending || this.historyMutationPending || this.conversationLoadPendingId)
      return false;
    runInAction(() => {
      this.historyMutationPending = "delete";
    });
    try {
      const result = await deleteAgentConversationAction({
        conversationId: id,
      });
      if (!result?.ok) throw new Error();
      this.historyRefreshVersion += 1;
      runInAction(() => {
        this.historySearchPending = false;
        this.historyLoadMorePending = null;
        this.archivedConversations = this.archivedConversations.filter((conversation) => conversation.id !== id);
        if (this.lastArchivedConversation?.id === id) this.lastArchivedConversation = null;
      });
      return true;
    } catch {
      this.toastError("AgentChat.errors.sendFailed");
      return false;
    } finally {
      runInAction(() => {
        this.historyMutationPending = null;
      });
    }
  };

  sendMessage = async (
    text: string,
    options: {
      appendUser?: boolean;
      conversationId?: string | null;
      messageId?: string;
      pageRoute?: string;
      retry?: boolean;
      pollAttempt?: number;
      reconcile?: boolean;
    } = {},
  ) => {
    if (this.isWorkspaceSetupPending) return;
    const trimmed = text.trim();
    if (!trimmed || (this.isWorking && !options.reconcile)) return;
    const messageId = options.messageId ?? globalThis.crypto.randomUUID();
    const pageRoute = options.pageRoute ?? (typeof window === "undefined" ? "/" : window.location.pathname);
    const conversationId = options.conversationId === undefined ? this.conversationId : options.conversationId;

    runInAction(() => {
      if (options.appendUser !== false) {
        this.items.push({
          kind: "user",
          id: nextItemId(),
          messageId,
          text: trimmed,
          at: new Date(),
        });
      }
      this.isWorking = true;
    });

    const controller = new AbortController();
    this.abortController = controller;
    this.activeTurnFailed = false;
    this.activeTurnCompleted = false;
    this.activeTurnDisposition = "stream";
    this.activeStreamKey = `stream-${++this.streamSequence}`;

    try {
      const response = await fetch("/api/agent/messages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          conversationId: conversationId ?? undefined,
          clientRequestId: messageId,
          text: trimmed,
          pageContext: { route: pageRoute },
          locale: appLocaleOrDefault(this.rootStore.localeStore.locale),
          retry: Boolean(options.retry),
        }),
        signal: controller.signal,
      });

      const responseConversationId = response.headers.get("x-conversation-id");
      if (responseConversationId) {
        runInAction(() => {
          this.conversationId = responseConversationId;
          this.isDraftConversationSelected = false;
          if (this.queuedPrompt && !this.queuedPromptConversationId)
            this.queuedPromptConversationId = responseConversationId;
        });
      }

      if (!response.ok || !response.body) {
        const message = await response.json().catch(() => null);
        const bodyConversationId =
          message &&
          typeof message === "object" &&
          typeof (message as { conversationId?: unknown }).conversationId === "string"
            ? String((message as { conversationId: string }).conversationId)
            : null;
        if (!responseConversationId && bodyConversationId) {
          runInAction(() => {
            this.conversationId = bodyConversationId;
            this.isDraftConversationSelected = false;
          });
        }
        const disposition =
          response.status === 409 &&
          message &&
          typeof message === "object" &&
          ["running", "failed", "uncertain", "conflict"].includes(
            String((message as { disposition?: unknown }).disposition),
          )
            ? (String((message as { disposition?: unknown }).disposition) as
                | "running"
                | "failed"
                | "uncertain"
                | "conflict")
            : null;
        this.activeTurnDisposition = disposition ?? "transport";
        this.activeTurnFailed = disposition === "failed" || disposition === null;
        if (!disposition) {
          this.toastError("AgentChat.errors.sendFailed", {
            descriptionKey:
              typeof message === "string" && response.status === 429 ? "AgentChat.errors.limitReached" : undefined,
          });
        } else if (disposition === "uncertain" || disposition === "conflict")
          this.toastError("AgentChat.errors.sendFailed");
        return;
      }

      await this.readStream(response.body);
      if (!this.activeTurnCompleted) {
        this.activeTurnFailed = true;
        this.activeTurnDisposition = "transport";
      }
    } catch (error) {
      if ((error as Error)?.name !== "AbortError") {
        this.activeTurnFailed = true;
        this.activeTurnDisposition = "transport";
        this.toastError("AgentChat.errors.sendFailed");
      }
    } finally {
      if (this.abortController !== controller) return;

      runInAction(() => {
        this.clearStreaming();
        if (
          this.activeTurnFailed &&
          !controller.signal.aborted &&
          (this.activeTurnDisposition === "failed" || this.activeTurnDisposition === "transport") &&
          !this.items.some((item) => item.kind === "turn_error" && item.messageId === messageId)
        ) {
          this.items.push({
            kind: "turn_error",
            id: nextItemId(),
            messageId,
            text: trimmed,
            pageRoute,
            retry: this.activeTurnDisposition === "failed",
            at: new Date(),
          });
        }
      });

      await this.loadConfig();
      await this.refreshConversations();
      if (this.abortController !== controller) return;

      const queued = this.queuedPrompt;
      const queuedConversationId = this.queuedPromptConversationId;
      const queuedMessageId = this.queuedPromptMessageId;
      const queuedPageRoute = this.queuedPromptPageRoute;
      const shouldSendQueued = Boolean(
        queued &&
          queuedMessageId &&
          queuedPageRoute &&
          this.activeTurnCompleted &&
          !this.activeTurnFailed &&
          !this.usage?.blockedReason,
      );
      const pollAttempt = options.pollAttempt ?? 0;
      const runningConversationId = this.activeTurnDisposition === "running" ? this.conversationId : null;
      const shouldContinuePolling = Boolean(runningConversationId && pollAttempt < AGENT_TURN_POLL_MAX_ATTEMPTS);
      runInAction(() => {
        this.abortController = null;
        this.isWorking = shouldContinuePolling;
        if (shouldSendQueued) {
          this.queuedPrompt = null;
          this.queuedPromptMessageId = null;
          this.queuedPromptConversationId = null;
          this.queuedPromptPageRoute = null;
        }
      });
      if (queued && queuedMessageId && queuedPageRoute && shouldSendQueued) {
        void this.sendMessage(queued, {
          conversationId: queuedConversationId,
          messageId: queuedMessageId,
          pageRoute: queuedPageRoute,
        });
      }
      if (runningConversationId && shouldContinuePolling) {
        globalThis.setTimeout(() => {
          if (this.isWorking && !this.abortController && this.conversationId === runningConversationId) {
            void this.sendMessage(trimmed, {
              appendUser: false,
              conversationId: runningConversationId,
              messageId,
              pageRoute,
              retry: false,
              pollAttempt: pollAttempt + 1,
              reconcile: true,
            });
          }
        }, AGENT_TURN_POLL_DELAY_MS);
      } else if (runningConversationId) void this.loadConversation(runningConversationId);
    }
  };

  private readStream = async (body: ReadableStream<Uint8Array>) => {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";

      for (const frame of frames) {
        const line = frame.split("\n").find((candidate) => candidate.startsWith("data: "));
        if (!line) continue;
        try {
          this.handleEvent(JSON.parse(line.slice(6)));
        } catch {}
      }
    }
  };

  respondToApproval = async (item: Extract<AgentChatItem, { kind: "approval" }>, decision: "approve" | "reject") => {
    if (!this.conversationId || this.isWorkspaceSetupPending || item.resolution || item.pendingDecision) return;

    try {
      runInAction(() => {
        item.pendingDecision = decision;
      });
      const result = await respondToApprovalAction({
        conversationId: this.conversationId,
        requestId: item.requestId,
        decision,
      });
      if (!result?.ok) throw new Error();
      runInAction(() => {
        item.resolution = decision;
      });
    } catch {
      this.toastError("AgentChat.errors.approvalFailed");
    } finally {
      runInAction(() => {
        item.pendingDecision = null;
      });
    }
  };

  private currentAssistantItem() {
    const last = this.items[this.items.length - 1];
    if (last?.kind === "assistant" && last.streaming) return last;

    this.items.push({
      kind: "assistant",
      id: nextItemId(),
      text: "",
      streaming: true,
      at: new Date(),
    });
    return this.items[this.items.length - 1] as Extract<AgentChatItem, { kind: "assistant" }>;
  }

  private handleEvent = (event: { seq: number; type: string } & Record<string, unknown>) => {
    runInAction(() => {
      switch (event.type) {
        case "delta": {
          this.currentAssistantItem().text += String(event.text ?? "");
          break;
        }
        case "message_replay": {
          const messageId = typeof event.messageId === "string" ? event.messageId : null;
          if (!messageId || this.persistedAssistantMessageIds.has(messageId) || !Array.isArray(event.parts)) break;
          this.persistedAssistantMessageIds.add(messageId);
          const at = typeof event.createdAt === "string" ? new Date(event.createdAt) : new Date();
          for (const part of event.parts) {
            if (!part || typeof part !== "object" || Array.isArray(part)) continue;
            this.appendPart("assistant", part as Parameters<AgentChatStore["appendPart"]>[1], at, messageId);
          }
          this.normalizeWorkspaceSetups();
          break;
        }
        case "message_committed": {
          const messageId = typeof event.messageId === "string" ? event.messageId : null;
          if (!messageId) break;
          this.persistedAssistantMessageIds.add(messageId);
          for (let index = this.items.length - 1; index >= 0; index -= 1) {
            const item = this.items[index];
            if (item?.kind === "user") break;
            if (item?.kind === "assistant") item.messageId = messageId;
          }
          break;
        }
        case "activity": {
          const activity = AgentActivityDescriptorSchema.safeParse(event.activity);
          if (!activity.success) break;
          const providerCallId = String(event.id);
          const existing = this.items.findLast(
            (item): item is Extract<AgentChatItem, { kind: "activity" }> =>
              item.kind === "activity" &&
              item.providerCallId === providerCallId &&
              item.turnKey === this.activeStreamKey &&
              item.status === "running",
          );
          if (existing) {
            existing.status = "running";
            existing.activity = activity.data;
          } else {
            this.items.push({
              kind: "activity",
              id: nextItemId(),
              providerCallId,
              turnKey: this.activeStreamKey,
              activity: activity.data,
              status: "running",
              at: new Date(),
            });
          }
          break;
        }
        case "activity_result": {
          const activity = this.items.findLast(
            (item): item is Extract<AgentChatItem, { kind: "activity" }> =>
              item.kind === "activity" &&
              item.providerCallId === String(event.id) &&
              item.turnKey === this.activeStreamKey &&
              item.status === "running",
          );
          if (activity) activity.status = event.status === "cancelled" ? "cancelled" : event.isError ? "error" : "done";
          break;
        }
        case "approval_request": {
          const activity = AgentActivityDescriptorSchema.safeParse(event.activity);
          if (!activity.success) break;
          this.items.push({
            kind: "approval",
            id: nextItemId(),
            requestId: String(event.requestId),
            activity: activity.data,
            pendingDecision: null,
            resolution: null,
            at: new Date(),
          });
          break;
        }
        case "approval_resolved": {
          const approval = this.items.find(
            (item): item is Extract<AgentChatItem, { kind: "approval" }> =>
              item.kind === "approval" && item.requestId === event.requestId,
          );
          if (approval && !approval.resolution)
            approval.resolution = event.decision as "approve" | "reject" | "timeout";

          break;
        }
        case "turn_done": {
          this.activeTurnCompleted = true;
          this.activeTurnFailed = Boolean(event.isError);
          this.clearStreaming();
          const resources = Array.isArray(event.affectedResources)
            ? event.affectedResources.filter((resource): resource is AgentActivityResource =>
                AGENT_ACTIVITY_RESOURCES.includes(resource as AgentActivityResource),
              )
            : [];
          if (resources.length) void this.refreshAffectedResources(resources);
          if (event.isError && event.errorMessage) this.toastError("AgentChat.errors.turnFailed");
          break;
        }
        case "ui_command": {
          void this.executeUiCommand({
            commandId: String(event.commandId),
            name: String(event.name),
            input: (event.input ?? {}) as Record<string, unknown>,
            turnKey: this.activeStreamKey,
          });
          break;
        }
        case "error": {
          this.activeTurnFailed = true;
          this.clearStreaming();
          this.toastError("AgentChat.errors.turnFailed");
          break;
        }
      }
    });
  };

  private refreshAffectedResources = async (resources: AgentActivityResource[]) => {
    const requested = new Set(resources);
    const refreshes: Promise<unknown>[] = [];
    if (requested.has("contacts")) refreshes.push(this.rootStore.contactsStore.refresh());
    if (requested.has("organizations")) refreshes.push(this.rootStore.organizationsStore.refresh());
    if (requested.has("deals")) refreshes.push(this.rootStore.dealsStore.refresh());
    if (requested.has("services")) refreshes.push(this.rootStore.servicesStore.refresh());
    if (requested.has("tasks")) refreshes.push(this.rootStore.tasksStore.refresh());
    if (requested.has("widgets")) refreshes.push(this.rootStore.widgetsStore.refresh());
    if (requested.has("terminology")) refreshes.push(this.rootStore.terminologyStore.refresh());
    if (requested.has("messages")) refreshes.push(this.rootStore.messagingThreadsStore.refresh());
    await Promise.allSettled(refreshes);
  };

  private executeUiCommand = async (command: {
    commandId: string;
    name: string;
    input: Record<string, unknown>;
    turnKey: string;
  }) => {
    const conversationId = this.conversationId;
    if (!conversationId || !isUiCommandName(command.name)) return;

    const outcome = await this.runUiCommand({
      commandId: command.commandId,
      name: command.name,
      input: command.input,
      turnKey: command.turnKey,
    });
    try {
      await respondToUiCommandAction({
        conversationId,
        commandId: command.commandId,
        name: command.name,
        ...outcome,
      });
    } catch {}
  };

  private runUiCommand = async (command: {
    commandId: string;
    name: UiCommandName;
    input: Record<string, unknown>;
    turnKey: string;
  }) => {
    const ui = this.rootStore.agentUiControlStore;

    if (command.name === "open_workspace_setup") {
      const input = PrepareAgentWorkspaceSetupSchema.safeParse(command.input);
      if (!input.success) return { ok: false, result: "The workspace setup plan was invalid." };

      const plan = buildAgentWorkspaceSetupPlan(input.data, this.rootStore.localeStore.translation ?? undefined);
      const planHash = await hashAgentWorkspaceSetupPlan(plan);
      const counts = agentWorkspaceSetupCounts(plan);
      runInAction(() => {
        for (const item of this.items) {
          if (
            item.kind === "workspace_setup" &&
            (item.commandId !== command.commandId || item.turnKey !== command.turnKey) &&
            (item.status === "preparing" || item.status === "ready" || item.status === "failed")
          )
            item.status = "superseded";
        }
        const existing = this.items.find(
          (item): item is Extract<AgentChatItem, { kind: "workspace_setup" }> =>
            item.kind === "workspace_setup" && item.commandId === command.commandId && item.turnKey === command.turnKey,
        );
        if (!existing) {
          this.items.push({
            kind: "workspace_setup",
            id: nextItemId(),
            commandId: command.commandId,
            turnKey: command.turnKey,
            setup: input.data,
            plan,
            planHash,
            status: "ready",
            at: new Date(),
          });
        }
      });
      return {
        ok: true,
        result: `Prepared a review plan with ${counts.columns} fields, ${counts.records} linked records, and ${counts.widgets} widgets.`,
      };
    }

    if (command.name === "navigate") return ui.navigate(String(command.input.targetId ?? ""));

    if (command.name === "highlight_element" || command.name === "start_tour") {
      const run = async () =>
        command.name === "highlight_element"
          ? ui.highlight(String(command.input.targetId ?? ""))
          : await ui.startGuidedTour(AgentTourSchema.safeParse(command.input).data?.steps);

      const first = await run();
      if (first.ok) return first;

      await new Promise((resolve) => setTimeout(resolve, 900));
      return run();
    }

    return {
      ok: false,
      result: `Unknown ui command: ${String(command.name)}.`,
    };
  };
}
