import { makeObservable, observable, action, computed, reaction, runInAction } from "mobx";

import type { RootStore } from "@/core/stores/root.store";
import type { AgentUsageSummary } from "@/ee/agent-chat/agent-usage.service";
import {
  clientSafeAgentMessageParts,
  type AgentConversationSummary,
  type AgentDataCounts,
  type AgentMessagePart,
} from "@/ee/agent-chat/agent-chat.schema";
import { AgentTourSchema } from "@/ee/agent-chat/agent-tours";
import { OpenRecordSchema } from "@/ee/agent-chat/ui-operations";
import {
  AgentActivityDescriptorSchema,
  AGENT_ACTIVITY_RESOURCES,
  describeAgentTool,
  type AgentActivityDescriptor,
} from "@/ee/agent-chat/agent-activity";
import { agentPageState, agentActionPageFromPathname } from "@/ee/agent-chat/agent-page-actions";

import { isDemoEnvironment, reportApplicationError } from "@/core/errors/report-application-error";

import { BaseStore } from "@/core/base/base.store";

import {
  getAgentConfigAction,
  getAgentConversationAction,
  archiveAgentConversationAction,
  cancelAgentTurnAction,
  deleteAgentConversationAction,
  listAgentConversationsAction,
  restoreAgentConversationAction,
  respondToApprovalAction,
  respondToUiCommandAction,
} from "./actions";
import { appLocaleOrDefault } from "@/i18n/locale-registry";
import { internalToolIdentity } from "@/ee/agent-chat/tool-identity";

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
      resolution: "approve" | "reject" | "timeout" | "cancelled" | null;
      pendingDecision: "approve" | "reject" | null;
      submittedDecision: "approve" | "reject" | null;
      retryDecision: "approve" | "reject" | null;
      at?: Date;
    };

export type AgentStreamStatus =
  | "idle"
  | "working"
  | "awaitingApproval"
  | "resuming"
  | "reconnecting"
  | "stopping"
  | "finalizing";

export type AgentRouteSyncStatus = "idle" | "queued" | "waiting" | "refreshing";

let itemSeq = 0;
const nextItemId = () => `item-${++itemSeq}`;
const UI_COMMAND_NAMES = ["navigate", "highlight_element", "start_tour", "click_ui_target", "open_record"] as const;
const AGENT_CONFIG_LOAD_TIMEOUT_MS = 15000;
const AGENT_STREAM_RECONNECT_DELAYS_MS = [250, 500, 1000, 2000, 5000] as const;
const AGENT_CANCEL_RETRY_DELAYS_MS = [0, 500, 1500, 4000] as const;
const AGENT_CHAT_OPEN_STORAGE_PREFIX = "customermates:agentChat:open:v1";
type UiCommandName = (typeof UI_COMMAND_NAMES)[number];
export type AgentConfigLoadStatus = "ready" | "disabled" | "retry";

function agentChatOpenStorageKey(rootStore: RootStore): string | null {
  const user = rootStore.userStore.user;
  return user ? `${AGENT_CHAT_OPEN_STORAGE_PREFIX}:${user.companyId}:${user.id}` : null;
}

function readAgentChatOpenPreference(storageKey: string | null): boolean | null {
  if (!storageKey || typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(storageKey);
    if (stored === null) return null;
    const parsed = JSON.parse(stored);
    return typeof parsed === "boolean" ? parsed : null;
  } catch {
    return null;
  }
}

function readAgentChatOpenOverride(): boolean | null {
  if (typeof window === "undefined") return null;
  const values = new URLSearchParams(window.location.search).getAll("agentChat");
  if (values.length !== 1) return null;
  if (values[0] === "open") return true;
  if (values[0] === "closed") return false;
  return null;
}

function writeAgentChatOpenPreference(storageKey: string | null, isOpen: boolean) {
  if (!storageKey || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(isOpen));
  } catch {}
}

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

function waitFor(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
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
  historyRefreshPending = false;
  conversationNextCursor: string | null = null;
  archivedConversationNextCursor: string | null = null;
  historyLoadMorePending: "active" | "archived" | null = null;
  historyMutationPending = false;
  olderMessagesCursor: string | null = null;
  olderMessagesPending = false;
  items: AgentChatItem[] = [];
  composerDraft = "";
  queuedPrompt: string | null = null;
  queuedPromptNeedsAttention = false;
  routeRefreshRevision = 0;
  streamStatus: AgentStreamStatus = "idle";
  routeSyncStatus: AgentRouteSyncStatus = "idle";
  autoOpenedPages = new Set<string>();
  isWorking = false;
  hasInSessionTerminalResult = false;
  private abortController: AbortController | null = null;
  private configRequest: Promise<AgentConfigLoadStatus> | null = null;
  private conversationLoadVersion = 0;
  private isDraftConversationSelected = false;
  private activeTurnFailed = false;
  private activeTurnCompleted = false;
  private activeTurnHasSuccessfulMutation = false;
  private activeTurnRefreshRequested = false;
  private activeTurnGeneration = 0;
  private activeTurnNextStreamIndex = 0;
  private activeTurnAdmissionConfirmed = false;
  private activeTurnStopRequested = false;
  private activeTurnStopPromise: Promise<void> | null = null;
  private activeTurnDisposition: "stream" | "running" | "failed" | "uncertain" | "conflict" | "transport" = "stream";
  private consumedRouteRefreshRevision = 0;
  private routeRefreshAssistantMessageIds = new Set<string>();
  private persistedAssistantMessageIds = new Set<string>();
  private loadedMessageIds = new Set<string>();
  private historyRefreshVersion = 0;
  private queuedPromptMessageId: string | null = null;
  private queuedPromptConversationId: string | null = null;
  private queuedPromptPageRoute: string | null = null;
  private activeStreamKey = "stream-0";
  private streamSequence = 0;
  private retryingApprovalRequestIds = new Set<string>();
  private uiCommandQueue: Promise<void> = Promise.resolve();
  private demoAutoOpened = false;
  private readonly openOverride: boolean | null;
  private openStorageKey: string | null;
  private openPreference: boolean | null;

  constructor(rootStore: RootStore) {
    super(rootStore);
    this.openOverride = readAgentChatOpenOverride();
    this.openStorageKey = agentChatOpenStorageKey(rootStore);
    this.openPreference = readAgentChatOpenPreference(this.openStorageKey);
    this.isOpen = this.openOverride ?? this.openPreference === true;
    makeObservable<this, "activeTurnAdmissionConfirmed" | "activeTurnStopRequested" | "consumedRouteRefreshRevision">(
      this,
      {
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
        historyRefreshPending: observable,
        conversationNextCursor: observable,
        archivedConversationNextCursor: observable,
        historyLoadMorePending: observable,
        historyMutationPending: observable,
        olderMessagesCursor: observable,
        olderMessagesPending: observable,
        items: observable,
        composerDraft: observable,
        queuedPrompt: observable,
        queuedPromptNeedsAttention: observable,
        routeRefreshRevision: observable,
        consumedRouteRefreshRevision: observable,
        streamStatus: observable,
        routeSyncStatus: observable,
        isWorking: observable,
        hasInSessionTerminalResult: observable,
        activeTurnAdmissionConfirmed: observable,
        activeTurnStopRequested: observable,
        conversationTitle: computed,
        isAwaitingAssistantResponse: computed,
        isContinuingAfterApproval: computed,
        canApplyRouteReload: computed,
        canInterrupt: computed,
        hasPendingRouteReload: computed,
        open: action,
        close: action,
        toggle: action,
        toggleExpanded: action,
        setComposerDraft: action,
        submitDraft: action,
        openForEmptyPage: action,
        editQueuedPrompt: action,
        removeQueuedPrompt: action,
        retryFailedTurn: action,
        newConversation: action,
        toggleHistory: action,
        takeRouteRefreshRequest: action,
        markRouteSyncWaiting: action,
        markRouteSyncQueued: action,
        markRouteSyncRefreshing: action,
      },
    );
    reaction(
      () => agentChatOpenStorageKey(rootStore),
      () => this.syncOpenPreferenceScope(),
    );
  }

  open = () => {
    this.setOpenState(true);
    void this.loadConfig();
  };

  get conversationTitle() {
    if (!this.conversationId) return null;
    const summary = this.conversations.find((conversation) => conversation.id === this.conversationId);
    return summary?.title ?? null;
  }

  get isAwaitingAssistantResponse() {
    return this.isWorking && this.items.at(-1)?.kind === "user";
  }

  get isContinuingAfterApproval() {
    const latestItem = this.items.at(-1);
    return (
      this.isWorking &&
      this.streamStatus === "working" &&
      latestItem?.kind === "approval" &&
      latestItem.resolution !== null
    );
  }

  get canApplyRouteReload() {
    return (
      !this.isWorking && !this.queuedPrompt && !this.composerDraft.trim() && !this.rootStore.agentUiControlStore.active
    );
  }

  get canInterrupt() {
    return (
      this.isWorking &&
      !this.activeTurnCompleted &&
      !this.activeTurnStopRequested &&
      this.activeTurnAdmissionConfirmed &&
      Boolean(this.conversationId)
    );
  }

  get hasPendingRouteReload() {
    return this.consumedRouteRefreshRevision !== this.routeRefreshRevision;
  }

  takeRouteRefreshRequest = () => {
    if (this.consumedRouteRefreshRevision === this.routeRefreshRevision) return false;
    this.consumedRouteRefreshRevision = this.routeRefreshRevision;
    return true;
  };

  markRouteSyncWaiting = () => {
    if (this.routeSyncStatus !== "idle") this.routeSyncStatus = "waiting";
  };

  markRouteSyncQueued = () => {
    if (this.routeSyncStatus !== "idle" && this.routeSyncStatus !== "refreshing") this.routeSyncStatus = "queued";
  };

  markRouteSyncRefreshing = () => {
    this.routeSyncStatus = "refreshing";
  };

  close = () => {
    this.setOpenState(false);
  };

  toggle = () => {
    if (this.isOpen) this.close();
    else this.open();
  };

  toggleExpanded = () => {
    this.isExpanded = !this.isExpanded;
  };

  toggleHistory = () => {
    const opening = !this.isHistoryOpen;
    this.isHistoryOpen = opening;
    if (opening) void this.refreshConversations();
  };

  newConversation = () => {
    if (this.isWorking || this.historyMutationPending) return;
    this.beginNewConversation();
  };

  private beginNewConversation() {
    this.resetConversation(null);
    this.isDraftConversationSelected = true;
    this.composerDraft = "";
    this.isHistoryOpen = false;
  }

  private setOpenState(isOpen: boolean) {
    this.syncOpenPreferenceScope();
    this.isOpen = isOpen;
    if (this.openOverride !== null) return;
    this.openPreference = isOpen;
    writeAgentChatOpenPreference(this.openStorageKey, isOpen);
  }

  private syncOpenPreferenceScope() {
    const storageKey = agentChatOpenStorageKey(this.rootStore);
    if (storageKey === this.openStorageKey) return;
    this.openStorageKey = storageKey;
    this.openPreference = readAgentChatOpenPreference(storageKey);
    this.isOpen = this.openOverride ?? this.openPreference === true;
    this.autoOpenedPages.clear();
    this.demoAutoOpened = false;
  }

  openForEmptyPage = (pathname: string) => {
    this.syncOpenPreferenceScope();
    if (
      this.openOverride !== null ||
      !this.enabled ||
      this.isOpen ||
      this.openPreference === false ||
      this.autoOpenedPages.has(pathname)
    )
      return;
    if (!this.counts) return;

    const page = agentActionPageFromPathname(pathname);
    if (!page || agentPageState(page, this.counts) !== "empty") return;

    this.autoOpenedPages.add(pathname);
    this.setOpenState(true);
  };

  setComposerDraft = (value: string) => {
    this.composerDraft = value;
  };

  submitDraft = () => {
    const text = this.composerDraft.trim();
    if (!text || this.usage?.blockedReason || this.queuedPrompt) return;
    if (this.isWorking) {
      if (this.queuedPrompt) return;
      this.queuedPrompt = text;
      this.queuedPromptNeedsAttention = false;
      this.queuedPromptMessageId = globalThis.crypto.randomUUID();
      this.queuedPromptConversationId = this.conversationId;
      this.queuedPromptPageRoute = typeof window === "undefined" ? "/" : window.location.pathname;
      this.composerDraft = "";
      return;
    }
    this.setOpenState(true);
    this.composerDraft = "";
    void this.sendMessage(text);
  };

  editQueuedPrompt = () => {
    if (!this.queuedPrompt) return;
    this.composerDraft = this.queuedPrompt;
    this.queuedPrompt = null;
    this.queuedPromptNeedsAttention = false;
    this.queuedPromptMessageId = null;
    this.queuedPromptConversationId = null;
    this.queuedPromptPageRoute = null;
  };

  removeQueuedPrompt = () => {
    this.queuedPrompt = null;
    this.queuedPromptNeedsAttention = false;
    this.queuedPromptMessageId = null;
    this.queuedPromptConversationId = null;
    this.queuedPromptPageRoute = null;
  };

  retryFailedTurn = (item: Extract<AgentChatItem, { kind: "turn_error" }>) => {
    if (this.isWorking || this.usage?.blockedReason) return;
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
    this.activeTurnGeneration += 1;
    this.stopStream();
    this.conversationId = id;
    this.items = [];
    this.persistedAssistantMessageIds.clear();
    this.loadedMessageIds.clear();
    this.queuedPrompt = null;
    this.queuedPromptNeedsAttention = false;
    this.queuedPromptMessageId = null;
    this.queuedPromptConversationId = null;
    this.queuedPromptPageRoute = null;
    this.isWorking = false;
    this.hasInSessionTerminalResult = false;
    this.streamStatus = "idle";
    this.activeTurnNextStreamIndex = 0;
    this.activeTurnAdmissionConfirmed = false;
    this.activeTurnStopRequested = false;
    this.activeTurnStopPromise = null;
    this.conversationLoadPendingId = null;
    this.conversationLoadError = false;
    this.olderMessagesCursor = null;
    this.olderMessagesPending = false;
  }

  selectConversation = async (id: string) => {
    if (this.isWorking || this.historyMutationPending) return;
    if (this.conversationId === id && !this.conversationLoadError) {
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
      this.hasInSessionTerminalResult = false;
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
        this.appendMessages(data.messages);
      });

      if (data.activeTurn) void this.reattachStream(id, loadVersion);
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
      runInAction(() => {
        const existing = this.items;
        this.items = [];
        this.appendMessages(data.messages);
        this.items = [...this.items, ...existing];
        this.olderMessagesCursor = data.nextCursor;
      });
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
      }[];
      for (const part of parts) this.appendPart(message.role, part, at, message.id);
      if (message.role === "assistant") this.persistedAssistantMessageIds.add(message.id);
    }
  }

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
        submittedDecision: null,
        retryDecision: null,
        resolution:
          part.status === "approved"
            ? "approve"
            : part.status === "rejected"
              ? "reject"
              : part.status === "timeout"
                ? "timeout"
                : part.status === "cancelled"
                  ? "cancelled"
                  : null,
        at,
      });
    } else if (part.type === "tool_use" && part.id && part.name) {
      this.items.push({
        kind: "activity",
        id: nextItemId(),
        providerCallId: part.id,
        ...(messageId ? { turnKey: `message-${messageId}` } : {}),
        activity: describeAgentTool(internalToolIdentity(part.name), part.input),
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
    if (!this.canInterrupt || !this.conversationId) return;
    const activeController = this.abortController;
    const conversationId = this.conversationId;
    const generation = this.activeTurnGeneration;
    this.activeTurnStopRequested = true;
    this.activeTurnStopPromise = this.requestActiveTurnCancellation(conversationId, generation).then((outcome) => {
      if (generation !== this.activeTurnGeneration) return;
      runInAction(() => {
        if (outcome === "cancelling") {
          if (!this.activeTurnCompleted) {
            this.markActiveTurnStopped();
            this.clearStreaming();
            for (const item of this.items) {
              if (item.kind === "activity" && item.status === "running") item.status = "cancelled";
              if (
                item.kind === "approval" &&
                !item.resolution &&
                !item.pendingDecision &&
                !item.submittedDecision &&
                !item.retryDecision
              ) {
                item.pendingDecision = null;
                item.submittedDecision = null;
                item.retryDecision = null;
                item.resolution = "cancelled";
              }
            }
          }
          return;
        }

        this.activeTurnStopRequested = false;
        this.streamStatus = this.activeTurnCompleted ? "finalizing" : "reconnecting";
      });
      if (outcome === "failed") this.toastError("AgentChat.errors.stopFailed");
    });
    activeController?.abort();
    runInAction(() => {
      this.streamStatus = "stopping";
    });
  };

  private requestActiveTurnCancellation = async (conversationId: string, generation: number) => {
    for (const delay of AGENT_CANCEL_RETRY_DELAYS_MS) {
      if (delay > 0) await waitFor(delay);
      if (generation !== this.activeTurnGeneration || this.activeTurnCompleted) return "inactive" as const;
      try {
        const result = await cancelAgentTurnAction({ conversationId });
        if (result?.ok) return result.data.cancelling ? ("cancelling" as const) : ("inactive" as const);
      } catch {}
    }
    return "failed" as const;
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
    try {
      const response = await withDeadline(getAgentConfigAction(), AGENT_CONFIG_LOAD_TIMEOUT_MS);
      if (!response.ok) return "retry";
      if (!response.data.enabled) {
        runInAction(() => {
          this.enabled = false;
        });
        return "disabled";
      }
      const config = response.data;

      runInAction(() => {
        const preserveExactHistory = Boolean(this.historyMutationPending);
        const preserveLoadedPages = preserveExactHistory || this.isHistoryOpen;
        const conversations = (config.conversations ?? []).map((conversation) => ({
          ...conversation,
          updatedAt: new Date(conversation.updatedAt),
        }));
        const archivedConversations = (config.archivedConversations ?? []).map((conversation) => ({
          ...conversation,
          updatedAt: new Date(conversation.updatedAt),
        }));
        this.enabled = true;
        this.usage = config.usage;
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
      if (typeof window !== "undefined") this.openForEmptyPage(window.location.pathname);
      if (!this.conversationId && !this.isDraftConversationSelected && config.conversationId)
        await this.loadConversation(config.conversationId);
      if (
        this.openOverride === null &&
        isDemoEnvironment() &&
        !this.isOpen &&
        this.openPreference !== false &&
        !this.demoAutoOpened
      ) {
        this.demoAutoOpened = true;
        runInAction(() => {
          this.setOpenState(true);
        });
      }
      return "ready";
    } catch {
      return "retry";
    }
  };

  refreshConversations = async () => {
    const refreshVersion = ++this.historyRefreshVersion;
    runInAction(() => {
      this.historyRefreshPending = true;
      this.historyLoadMorePending = null;
    });
    try {
      const result = await listAgentConversationsAction({ kind: "both" });
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
        this.historyRefreshPending = false;
      });
    } catch {
      if (refreshVersion !== this.historyRefreshVersion) return;
      runInAction(() => {
        this.historyRefreshError = true;
        this.historyRefreshPending = false;
      });
    }
  };

  loadMoreConversations = async (kind: "active" | "archived") => {
    const cursor = kind === "active" ? this.conversationNextCursor : this.archivedConversationNextCursor;
    if (!cursor || this.historyLoadMorePending || this.historyRefreshPending || this.historyMutationPending) return;
    const refreshVersion = this.historyRefreshVersion;
    runInAction(() => {
      this.historyLoadMorePending = kind;
    });

    try {
      const result = await listAgentConversationsAction({
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
    if (this.isWorking || this.historyMutationPending || this.conversationLoadPendingId) return false;
    const archivedConversation = this.conversations.find((conversation) => conversation.id === id) ?? null;
    runInAction(() => {
      this.historyMutationPending = true;
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
        this.historyRefreshPending = false;
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
      return true;
    } catch {
      this.toastError("AgentChat.errors.sendFailed");
      return false;
    } finally {
      runInAction(() => {
        this.historyMutationPending = false;
      });
    }
  };

  restoreLastArchivedConversation = async () => {
    const archived = this.lastArchivedConversation;
    if (!archived || this.isWorking || this.historyMutationPending) return;

    await this.restoreArchivedConversation(archived.id);
  };

  restoreArchivedConversation = async (id: string) => {
    if (this.isWorking || this.historyMutationPending || this.conversationLoadPendingId) return false;

    runInAction(() => {
      this.historyMutationPending = true;
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
        this.historyRefreshPending = false;
        this.historyLoadMorePending = null;
        this.conversations = conversations;
        this.conversationNextCursor = result.data.nextCursor;
        this.archivedConversations = this.archivedConversations.filter((conversation) => conversation.id !== id);
        if (this.lastArchivedConversation?.id === id) this.lastArchivedConversation = null;
      });
      await this.loadConversation(result.data.activeConversationId);
      return true;
    } catch {
      this.toastError("AgentChat.errors.sendFailed");
      return false;
    } finally {
      runInAction(() => {
        this.historyMutationPending = false;
      });
    }
  };

  deleteArchivedConversation = async (id: string) => {
    if (this.isWorking || this.historyMutationPending || this.conversationLoadPendingId) return false;
    runInAction(() => {
      this.historyMutationPending = true;
    });
    try {
      const result = await deleteAgentConversationAction({
        conversationId: id,
      });
      if (!result?.ok) throw new Error();
      this.historyRefreshVersion += 1;
      runInAction(() => {
        this.historyRefreshPending = false;
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
        this.historyMutationPending = false;
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
      reconcileBusyTurn?: boolean;
    } = {},
  ) => {
    const trimmed = text.trim();
    if (!trimmed || this.isWorking) return;
    if (this.usage?.blockedReason && !options.reconcileBusyTurn) return;
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
    this.activeTurnDisposition = "stream";
    const turnGeneration = this.beginActiveTurnMutationTracking();

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
        if (response.status === 403 && isDemoEnvironment()) {
          runInAction(() => {
            if (options.appendUser !== false)
              this.items = this.items.filter((item) => !(item.kind === "user" && item.messageId === messageId));

            if (!this.composerDraft) this.composerDraft = trimmed;
          });
          reportApplicationError(new Error("The assistant cannot send messages in demo mode."));
          return;
        }
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
        if (disposition === "running") {
          runInAction(() => {
            this.activeTurnAdmissionConfirmed = true;
          });
        }
        if (!disposition) {
          this.toastError("AgentChat.errors.sendFailed", {
            descriptionKey:
              typeof message === "string" && response.status === 429 ? "AgentChat.errors.limitReached" : undefined,
          });
        } else if (disposition === "uncertain" || disposition === "conflict")
          this.toastError("AgentChat.errors.sendFailed");
        return;
      }

      runInAction(() => {
        this.activeTurnAdmissionConfirmed = true;
      });

      await this.followActiveTurn({
        conversationId: this.conversationId ?? conversationId,
        generation: turnGeneration,
        initialBody: response.body,
        loadVersion: this.conversationLoadVersion,
      });
    } catch (error) {
      if (turnGeneration !== this.activeTurnGeneration) return;
      const recoveryConversationId = this.conversationId ?? conversationId;
      if (
        recoveryConversationId &&
        this.activeTurnAdmissionConfirmed &&
        ((error as Error)?.name === "AbortError" || this.activeTurnDisposition === "stream")
      ) {
        await this.followActiveTurn({
          conversationId: recoveryConversationId,
          generation: turnGeneration,
          initialBody: null,
          loadVersion: this.conversationLoadVersion,
        });
      } else if ((error as Error)?.name === "AbortError" && this.activeTurnStopRequested)
        this.activeTurnCompleted = true;
      else {
        this.activeTurnFailed = true;
        this.activeTurnDisposition = "transport";
        this.toastError("AgentChat.errors.sendFailed");
      }
    } finally {
      if (turnGeneration !== this.activeTurnGeneration) return;

      const queued = this.queuedPrompt;
      const queuedConversationId = this.queuedPromptConversationId;
      const queuedMessageId = this.queuedPromptMessageId;
      const queuedPageRoute = this.queuedPromptPageRoute;
      const runningConversationId = this.activeTurnDisposition === "running" ? this.conversationId : null;
      runInAction(() => {
        if (!this.activeTurnCompleted && this.activeTurnHasSuccessfulMutation)
          this.requestRouteRefreshForActiveTurn(null, true);
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
        this.abortController = null;
        this.isWorking = Boolean(runningConversationId);
        this.activeTurnStopPromise = null;
        this.streamStatus = runningConversationId
          ? "reconnecting"
          : this.hasPendingRouteReload || queued
            ? "finalizing"
            : "idle";
      });

      const configRequest = this.loadConfig();
      if (!this.hasPendingRouteReload) void this.refreshConversations();
      if (!queued && !runningConversationId) return;

      await configRequest;
      if (turnGeneration !== this.activeTurnGeneration) return;

      const queuedPromptIsCurrent = Boolean(
        queued &&
          this.queuedPrompt === queued &&
          this.queuedPromptConversationId === queuedConversationId &&
          this.queuedPromptMessageId === queuedMessageId &&
          this.queuedPromptPageRoute === queuedPageRoute,
      );
      const shouldSendQueued = Boolean(
        queuedPromptIsCurrent &&
          queuedMessageId &&
          queuedPageRoute &&
          this.activeTurnCompleted &&
          !this.activeTurnFailed &&
          !this.usage?.blockedReason,
      );
      runInAction(() => {
        if (shouldSendQueued) {
          this.queuedPrompt = null;
          this.queuedPromptNeedsAttention = false;
          this.queuedPromptMessageId = null;
          this.queuedPromptConversationId = null;
          this.queuedPromptPageRoute = null;
        } else if (!runningConversationId) {
          if (queuedPromptIsCurrent) this.queuedPromptNeedsAttention = true;
          if (queuedPromptIsCurrent && this.hasPendingRouteReload) this.routeSyncStatus = "waiting";
          this.streamStatus = "idle";
        }
      });
      if (queued && queuedMessageId && queuedPageRoute && shouldSendQueued) {
        void this.sendMessage(queued, {
          conversationId: queuedConversationId,
          messageId: queuedMessageId,
          pageRoute: queuedPageRoute,
        });
      }
      if (runningConversationId) {
        void this.rejoinBusyConversation(runningConversationId, {
          text: trimmed,
          messageId,
          pageRoute,
        });
      }
    }
  };

  private rejoinBusyConversation = async (
    conversationId: string,
    resend: { text: string; messageId: string; pageRoute: string },
  ) => {
    const loadVersion = this.conversationLoadVersion;
    const generation = this.activeTurnGeneration;
    await this.activeTurnStopPromise;
    if (
      generation !== this.activeTurnGeneration ||
      loadVersion !== this.conversationLoadVersion ||
      this.conversationId !== conversationId
    )
      return;
    await this.reattachStream(conversationId, loadVersion, generation);
    if (
      generation !== this.activeTurnGeneration ||
      loadVersion !== this.conversationLoadVersion ||
      this.conversationId !== conversationId
    )
      return;
    if (this.abortController || this.isWorking) return;
    void this.sendMessage(resend.text, {
      appendUser: false,
      conversationId,
      messageId: resend.messageId,
      pageRoute: resend.pageRoute,
      retry: false,
      reconcileBusyTurn: true,
    });
  };

  private reattachStream = async (conversationId: string, loadVersion: number, existingGeneration?: number) => {
    if (this.abortController) return;

    const generation = existingGeneration ?? this.beginActiveTurnMutationTracking();
    runInAction(() => {
      this.activeTurnAdmissionConfirmed = true;
      this.isWorking = true;
    });

    try {
      await this.followActiveTurn({
        conversationId,
        generation,
        initialBody: null,
        loadVersion,
      });
    } catch {
      if (loadVersion !== this.conversationLoadVersion) return;
    } finally {
      if (generation === this.activeTurnGeneration && loadVersion === this.conversationLoadVersion) {
        runInAction(() => {
          this.abortController = null;
          this.isWorking = false;
          this.streamStatus = this.hasPendingRouteReload ? "finalizing" : "idle";
          this.activeTurnStopPromise = null;
        });
        void this.loadConfig();
        if (!this.hasPendingRouteReload) void this.refreshConversations();
      }
    }
  };

  private followActiveTurn = async ({
    conversationId,
    generation,
    initialBody,
    loadVersion,
  }: {
    conversationId: string | null;
    generation: number;
    initialBody: ReadableStream<Uint8Array> | null;
    loadVersion: number;
  }) => {
    let body = initialBody;
    let reconnectAttempt = 0;
    let reconnectImmediately = initialBody === null;
    let reconnectFailureReported = false;
    const reportReconnectFailure = (error: unknown) => {
      if ((error as Error)?.name === "AbortError" || reconnectFailureReported) return;
      reconnectFailureReported = true;
      reportApplicationError(error);
    };
    while (
      generation === this.activeTurnGeneration &&
      loadVersion === this.conversationLoadVersion &&
      !this.activeTurnCompleted
    ) {
      if (body) {
        const indexBeforeRead = this.activeTurnNextStreamIndex;
        let readFailed = false;
        try {
          await this.readStream(body, generation);
        } catch (error) {
          if (generation !== this.activeTurnGeneration || loadVersion !== this.conversationLoadVersion) return;
          readFailed = true;
          reportReconnectFailure(error);
        }
        body = null;
        if (this.activeTurnCompleted) return;
        if (this.activeTurnNextStreamIndex > indexBeforeRead) {
          reconnectAttempt = 0;
          if (!readFailed) reconnectFailureReported = false;
        }
      }

      if (!conversationId) {
        if (!this.activeTurnStopRequested) {
          this.activeTurnFailed = true;
          this.activeTurnDisposition = "transport";
        }
        return;
      }

      await this.activeTurnStopPromise;
      if (generation !== this.activeTurnGeneration || loadVersion !== this.conversationLoadVersion) return;

      if (!reconnectImmediately) {
        const snapshot = await getAgentConversationAction(conversationId).catch(() => null);
        if (snapshot && !snapshot.activeTurn) {
          runInAction(() => {
            this.activeTurnCompleted = true;
            this.activeTurnFailed = true;
            this.activeTurnDisposition = "uncertain";
            this.clearStreaming();
            this.requestRouteRefreshForActiveTurn(null, true);
          });
          return;
        }
      }

      runInAction(() => {
        this.streamStatus = this.activeTurnStopRequested ? "stopping" : "reconnecting";
      });
      const delay = reconnectImmediately
        ? 0
        : (AGENT_STREAM_RECONNECT_DELAYS_MS[Math.min(reconnectAttempt, AGENT_STREAM_RECONNECT_DELAYS_MS.length - 1)] ??
          AGENT_STREAM_RECONNECT_DELAYS_MS.at(-1) ??
          5000);
      reconnectImmediately = false;
      reconnectAttempt += 1;
      await waitFor(delay);
      if (generation !== this.activeTurnGeneration || loadVersion !== this.conversationLoadVersion) return;

      const controller = new AbortController();
      this.abortController = controller;
      try {
        const response = await fetch(
          `/api/agent/conversations/${conversationId}/stream?startIndex=${this.activeTurnNextStreamIndex}`,
          { signal: controller.signal },
        );
        if (!response.ok || !response.body) throw new Error("The assistant run could not be rejoined.");
        body = response.body;
      } catch (error) {
        if (generation !== this.activeTurnGeneration || loadVersion !== this.conversationLoadVersion) return;
        reportReconnectFailure(error);
      }
    }
  };

  private readStream = async (body: ReadableStream<Uint8Array>, generation = this.activeTurnGeneration) => {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (generation !== this.activeTurnGeneration) {
        await reader.cancel();
        return;
      }

      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";

      for (const frame of frames) {
        const line = frame.split("\n").find((candidate) => candidate.startsWith("data: "));
        if (!line) continue;
        const event = JSON.parse(line.slice(6)) as {
          seq?: unknown;
          type?: unknown;
        } & Record<string, unknown>;
        if (!Number.isInteger(event.seq) || typeof event.type !== "string")
          throw new Error("The assistant stream contained an invalid event.");
        const sequence = Number(event.seq);
        if (sequence < this.activeTurnNextStreamIndex) continue;
        this.handleEvent(event as { seq: number; type: string } & Record<string, unknown>);
        this.activeTurnNextStreamIndex = sequence + 1;
      }
    }
  };

  respondToApproval = async (item: Extract<AgentChatItem, { kind: "approval" }>, decision: "approve" | "reject") => {
    if (
      !this.conversationId ||
      item.resolution ||
      item.pendingDecision ||
      item.submittedDecision ||
      (item.retryDecision !== null && item.retryDecision !== decision)
    )
      return;

    try {
      runInAction(() => {
        item.pendingDecision = decision;
        item.retryDecision = null;
      });
      const result = await respondToApprovalAction({
        conversationId: this.conversationId,
        requestId: item.requestId,
        decision,
      });
      if (!result?.ok) {
        runInAction(() => {
          item.pendingDecision = null;
        });
        this.toastError("AgentChat.errors.approvalFailed");
        return;
      }
      runInAction(() => {
        item.pendingDecision = null;
        if (!item.resolution) {
          item.submittedDecision = decision;
          item.retryDecision = null;
          this.streamStatus = "resuming";
        }
      });
      if (!result.data.resumed) void this.retryApprovalResume(item, decision);
    } catch {
      runInAction(() => {
        item.pendingDecision = null;
        if (!item.resolution) {
          item.submittedDecision = decision;
          item.retryDecision = null;
          this.streamStatus = "resuming";
        }
      });
      void this.retryApprovalResume(item, decision);
    } finally {
      runInAction(() => {
        item.pendingDecision = null;
      });
    }
  };

  private retryApprovalResume = async (
    item: Extract<AgentChatItem, { kind: "approval" }>,
    decision: "approve" | "reject",
  ) => {
    if (this.retryingApprovalRequestIds.has(item.requestId)) return;
    this.retryingApprovalRequestIds.add(item.requestId);
    const conversationId = this.conversationId;

    try {
      for (const delay of [500, 1500, 4000]) {
        await waitFor(delay);
        if (
          !conversationId ||
          this.conversationId !== conversationId ||
          item.resolution ||
          item.submittedDecision !== decision
        )
          return;
        try {
          const result = await respondToApprovalAction({
            conversationId,
            requestId: item.requestId,
            decision,
          });
          if (result?.ok && result.data.resumed) return;
        } catch {}
      }
      if (!item.resolution && item.submittedDecision === decision) {
        runInAction(() => {
          item.submittedDecision = null;
          item.retryDecision = decision;
          this.streamStatus = "awaitingApproval";
        });
        this.toastError("AgentChat.errors.approvalFailed");
      }
    } finally {
      this.retryingApprovalRequestIds.delete(item.requestId);
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
          if (!this.activeTurnStopRequested) this.streamStatus = "working";
          this.currentAssistantItem().text += String(event.text ?? "");
          break;
        }
        case "message_replay": {
          const messageId = typeof event.messageId === "string" ? event.messageId : null;
          const parts = clientSafeAgentMessageParts(event.parts);
          this.recordReplayedMutations(parts);
          if (!messageId || this.persistedAssistantMessageIds.has(messageId)) break;
          this.persistedAssistantMessageIds.add(messageId);
          const at = typeof event.createdAt === "string" ? new Date(event.createdAt) : new Date();
          for (const part of parts) this.appendPart("assistant", part, at, messageId);
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
          if (!this.activeTurnStopRequested) this.streamStatus = "working";
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
              (item.status === "running" || (this.activeTurnStopRequested && item.status === "cancelled")),
          );
          if (activity) {
            activity.status = event.status === "cancelled" ? "cancelled" : event.isError ? "error" : "done";
            if (activity.status === "done" && activity.activity.risk !== "read")
              this.activeTurnHasSuccessfulMutation = true;
          }
          break;
        }
        case "activity_superseded": {
          const providerCallId = String(event.id);
          this.items = this.items.filter(
            (item) =>
              !(
                item.kind === "activity" &&
                item.providerCallId === providerCallId &&
                item.turnKey === this.activeStreamKey
              ),
          );
          break;
        }
        case "approval_request": {
          const activity = AgentActivityDescriptorSchema.safeParse(event.activity);
          if (!activity.success) break;
          const requestId = String(event.requestId);
          const existing = this.items.find(
            (item): item is Extract<AgentChatItem, { kind: "approval" }> =>
              item.kind === "approval" && item.requestId === requestId,
          );
          if (existing) existing.activity = activity.data;
          else {
            this.items.push({
              kind: "approval",
              id: nextItemId(),
              requestId,
              activity: activity.data,
              pendingDecision: null,
              submittedDecision: null,
              retryDecision: null,
              resolution: null,
              at: new Date(),
            });
          }
          if (!this.activeTurnStopRequested && !existing?.resolution) this.streamStatus = "awaitingApproval";
          break;
        }
        case "approval_resolved": {
          const approval = this.items.find(
            (item): item is Extract<AgentChatItem, { kind: "approval" }> =>
              item.kind === "approval" && item.requestId === event.requestId,
          );
          const decision = ["approve", "reject", "timeout", "cancelled"].includes(String(event.decision))
            ? (String(event.decision) as "approve" | "reject" | "timeout" | "cancelled")
            : "timeout";
          if (approval) {
            approval.pendingDecision = null;
            approval.submittedDecision = null;
            approval.retryDecision = null;
            approval.resolution = this.activeTurnStopRequested && decision === "timeout" ? "cancelled" : decision;
          }
          if (!this.activeTurnStopRequested) this.streamStatus = "working";

          break;
        }
        case "turn_done": {
          this.activeTurnCompleted = true;
          this.activeTurnFailed = Boolean(event.isError);
          this.hasInSessionTerminalResult = true;
          this.streamStatus = "finalizing";
          this.clearStreaming();
          const resources = Array.isArray(event.affectedResources)
            ? event.affectedResources.filter((resource) =>
                AGENT_ACTIVITY_RESOURCES.includes(resource as (typeof AGENT_ACTIVITY_RESOURCES)[number]),
              )
            : [];
          this.requestRouteRefreshForActiveTurn(
            typeof event.assistantMessageId === "string" ? event.assistantMessageId : null,
            event.hasSuccessfulMutation === true || resources.length > 0,
          );
          if (event.isError && event.errorMessage && event.terminalCode !== "partial")
            this.toastError("AgentChat.errors.turnFailed");
          break;
        }
        case "ui_command": {
          this.enqueueUiCommand({
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

  private beginActiveTurnMutationTracking() {
    this.activeTurnGeneration += 1;
    this.activeTurnCompleted = false;
    this.hasInSessionTerminalResult = false;
    this.activeTurnHasSuccessfulMutation = false;
    this.activeTurnRefreshRequested = false;
    this.activeTurnNextStreamIndex = 0;
    this.activeTurnAdmissionConfirmed = false;
    this.activeTurnStopRequested = false;
    this.activeTurnStopPromise = null;
    this.activeStreamKey = `stream-${++this.streamSequence}`;
    this.streamStatus = "working";
    return this.activeTurnGeneration;
  }

  private recordReplayedMutations(parts: AgentMessagePart[]) {
    if (parts.some((part) => part.type === "activity" && part.status === "done" && part.activity.risk !== "read"))
      this.activeTurnHasSuccessfulMutation = true;
  }

  private requestRouteRefreshForActiveTurn(assistantMessageId: string | null, hasAffectedResources: boolean) {
    if (this.activeTurnRefreshRequested) return;
    if (!this.activeTurnHasSuccessfulMutation && !hasAffectedResources) return;
    if (assistantMessageId && this.routeRefreshAssistantMessageIds.has(assistantMessageId)) return;

    this.activeTurnRefreshRequested = true;
    if (assistantMessageId) this.routeRefreshAssistantMessageIds.add(assistantMessageId);
    this.routeRefreshRevision += 1;
    this.routeSyncStatus = "queued";
  }

  private enqueueUiCommand = (command: {
    commandId: string;
    name: string;
    input: Record<string, unknown>;
    turnKey: string;
  }) => {
    const conversationId = this.conversationId;
    if (!conversationId || !isUiCommandName(command.name)) return;

    const execute = async () => {
      let outcome: { ok: boolean; result: string };
      try {
        outcome = await this.runUiCommand({
          commandId: command.commandId,
          name: command.name as UiCommandName,
          input: command.input,
          turnKey: command.turnKey,
        });
      } catch {
        outcome = {
          ok: false,
          result: "The interface action could not be completed.",
        };
      }
      try {
        await respondToUiCommandAction({
          conversationId,
          commandId: command.commandId,
          name: command.name as UiCommandName,
          ...outcome,
        });
      } catch {}
    };

    this.uiCommandQueue = this.uiCommandQueue.then(execute, execute);
  };

  private runUiCommand = async (command: {
    commandId: string;
    name: UiCommandName;
    input: Record<string, unknown>;
    turnKey: string;
  }) => {
    const ui = this.rootStore.agentUiControlStore;

    if (command.name === "navigate") return ui.navigate(String(command.input.targetId ?? ""));

    if (command.name === "click_ui_target") return ui.clickTarget(String(command.input.targetId ?? ""));

    if (command.name === "open_record") {
      const input = OpenRecordSchema.safeParse(command.input);
      if (!input.success) return { ok: false, result: "The record request was invalid." };
      return ui.openRecord(input.data);
    }

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
