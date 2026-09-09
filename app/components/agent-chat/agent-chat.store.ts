import { makeObservable, observable, action, computed, reaction, runInAction } from "mobx";

import type { RootStore } from "@/core/stores/root.store";
import type { AgentUsageSummary } from "@/ee/agent-chat/agent-usage.service";
import type { AgentMessageTurn } from "@/ee/agent-chat/agent-history";
import {
  clientSafeAgentMessageParts,
  hasRenderableAgentMessageParts,
  type AgentConversationSummary,
  type AgentDataCounts,
  type AgentMessagePart,
} from "@/ee/agent-chat/agent-chat.schema";
import { AgentTourSchema } from "@/ee/agent-chat/agent-tours";
import { stripRoutineTriggerBlock } from "@/ee/routines/routine-prompt";
import { OpenRecordSchema } from "@/ee/agent-chat/ui-operations";
import {
  AgentActivityDescriptorSchema,
  AGENT_ACTIVITY_RESOURCES,
  describeAgentTool,
  type AgentActivityDescriptor,
} from "@/ee/agent-chat/agent-activity";

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
  | { kind: "turn_interrupted"; id: string; messageId: string; at?: Date }
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

export type AgentProgressPhase = "starting" | "working" | "preparing_action";

let itemSeq = 0;
const nextItemId = () => `item-${++itemSeq}`;
const UI_COMMAND_NAMES = ["navigate", "highlight_element", "start_tour", "click_ui_target", "open_record"] as const;
const AGENT_CONFIG_LOAD_TIMEOUT_MS = 15000;
const AGENT_CONVERSATION_LOAD_TIMEOUT_MS = 15000;
const AGENT_ADMISSION_TIMEOUT_MS = 15000;
const AGENT_RECONNECT_TIMEOUT_MS = 15000;
const AGENT_TERMINAL_RECONCILE_TIMEOUT_MS = 5000;
const AGENT_CANCEL_ATTEMPT_TIMEOUT_MS = 5000;
const AGENT_APPROVAL_ATTEMPT_TIMEOUT_MS = 5000;
const AGENT_STREAM_INACTIVITY_TIMEOUT_MS = 60000;
const AGENT_RECONNECT_SNAPSHOT_FAILURE_LIMIT = 2;
const AGENT_STREAM_RECONNECT_DELAYS_MS = [250, 500, 1000, 2000, 5000] as const;
const AGENT_CANCEL_RETRY_DELAYS_MS = [0, 500, 1500, 4000] as const;
const AGENT_CHAT_OPEN_STORAGE_PREFIX = "customermates:agentChat:open:v2";
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

async function fetchWithDeadline(
  input: RequestInfo | URL,
  init: RequestInit,
  controller: AbortController,
  timeoutMs: number,
): Promise<Response> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      fetch(input, { ...init, signal: controller.signal }),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          const error = new Error("The assistant request timed out.");
          error.name = "AgentFetchDeadlineError";
          reject(error);
          controller.abort();
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function readWithInactivityDeadline(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      reader.read(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          const error = new Error("The assistant stream became inactive.");
          error.name = "AgentStreamInactivityError";
          reject(error);
        }, AGENT_STREAM_INACTIVITY_TIMEOUT_MS);
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
  private readonly persistOpenState: boolean;
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
  progressPhase: AgentProgressPhase | null = null;
  progressStartedAt: number | null = null;
  routeSyncStatus: AgentRouteSyncStatus = "idle";
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
  private activeTurnTerminalReconciliation: Promise<void> | null = null;
  private activeTurnDisposition: "stream" | "running" | "failed" | "uncertain" | "conflict" | "transport" = "stream";
  private consumedRouteRefreshRevision = 0;
  private routeRefreshAssistantMessageIds = new Set<string>();
  private persistedAssistantMessageIds = new Set<string>();
  private replayedAssistantMessageIds = new Set<string>();
  private loadedMessageIds = new Set<string>();
  private historyRefreshVersion = 0;
  private queuedPromptMessageId: string | null = null;
  private queuedPromptConversationId: string | null = null;
  private queuedPromptPageRoute: string | null = null;
  private activeStreamKey = "stream-0";
  private streamSequence = 0;
  private activeTurnClientRequestId: string | null = null;
  private activeTurnPageRoute: string | null = null;
  private activeTurnDetachedLoadVersion: number | null = null;
  private retryingApprovalRequestIds = new Set<string>();
  private uiCommandQueue: Promise<void> = Promise.resolve();
  private demoAutoOpened = false;
  private readonly openOverride: boolean | null;
  private openStorageKey: string | null;
  private openPreference: boolean | null;

  constructor(rootStore: RootStore, options: { persistOpenState?: boolean } = {}) {
    super(rootStore);
    this.persistOpenState = options.persistOpenState ?? true;
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
        progressPhase: observable,
        progressStartedAt: observable,
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
        openWithDraft: action,
        close: action,
        toggle: action,
        toggleExpanded: action,
        setComposerDraft: action,
        submitDraft: action,
        editQueuedPrompt: action,
        removeQueuedPrompt: action,
        retryFailedTurn: action,
        newConversation: action,
        toggleHistory: action,
        takeRouteRefreshRequest: action,
        markRouteSyncWaiting: action,
        markRouteSyncQueued: action,
        markRouteSyncRefreshing: action,
        markRouteSyncComplete: action,
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

  openWithDraft = (value: string) => {
    this.isHistoryOpen = false;
    this.composerDraft = value;
    this.open();
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

  markRouteSyncComplete = () => {
    if (this.routeSyncStatus === "refreshing") this.routeSyncStatus = "idle";
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
    if (!this.persistOpenState) return;
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
    this.demoAutoOpened = false;
  }

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
    this.prepareCurrentTurnForReplay(item.messageId, item.id);
    void this.sendMessage(item.text, {
      appendUser: false,
      messageId: item.messageId,
      pageRoute: item.pageRoute,
      retry: Boolean(item.retry),
    });
  };

  canRetryFailedTurn = (item: Extract<AgentChatItem, { kind: "turn_error" }>) => this.items.at(-1)?.id === item.id;

  private prepareCurrentTurnForReplay(clientRequestId: string, fallbackItemId?: string) {
    const userIndex = this.items.findLastIndex(
      (candidate) =>
        candidate.kind === "user" &&
        (candidate.messageId === clientRequestId || this.activeTurnClientRequestId === clientRequestId),
    );
    this.items =
      userIndex >= 0
        ? this.items.slice(0, userIndex + 1)
        : this.items.filter((candidate) => candidate.id !== fallbackItemId);
    const retainedAssistantMessageIds = new Set(
      this.items.flatMap((candidate) =>
        candidate.kind === "assistant" && candidate.messageId ? [candidate.messageId] : [],
      ),
    );
    for (const messageId of this.persistedAssistantMessageIds)
      if (!retainedAssistantMessageIds.has(messageId)) this.persistedAssistantMessageIds.delete(messageId);

    for (const messageId of this.replayedAssistantMessageIds)
      if (!retainedAssistantMessageIds.has(messageId)) this.replayedAssistantMessageIds.delete(messageId);
  }

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
    this.replayedAssistantMessageIds.clear();
    this.loadedMessageIds.clear();
    this.queuedPrompt = null;
    this.queuedPromptNeedsAttention = false;
    this.queuedPromptMessageId = null;
    this.queuedPromptConversationId = null;
    this.queuedPromptPageRoute = null;
    this.isWorking = false;
    this.hasInSessionTerminalResult = false;
    this.streamStatus = "idle";
    this.progressPhase = null;
    this.progressStartedAt = null;
    this.activeTurnNextStreamIndex = 0;
    this.activeTurnAdmissionConfirmed = false;
    this.activeTurnStopRequested = false;
    this.activeTurnStopPromise = null;
    this.activeTurnTerminalReconciliation = null;
    this.activeTurnClientRequestId = null;
    this.activeTurnPageRoute = null;
    this.activeTurnDetachedLoadVersion = null;
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

  selectConversationForEmbeddedViewer = async (id: string) => {
    if (this.historyMutationPending || (this.isWorking && this.conversationId !== id)) return;
    if (this.isWorking && !this.activeTurnAdmissionConfirmed) return;
    await this.loadConversation(id);
  };

  private loadConversation = async (id: string) => {
    const shouldPreserveActiveTurn =
      this.conversationId === id && this.isWorking && this.activeTurnAdmissionConfirmed && !this.activeTurnCompleted;
    const shouldResumeActiveTurn = shouldPreserveActiveTurn && !this.activeTurnStopRequested;
    const shouldPreserveStoppingTurn = shouldPreserveActiveTurn && this.activeTurnStopRequested;
    const resumeClientRequestId = this.activeTurnClientRequestId ?? undefined;
    const resumePageRoute = this.activeTurnPageRoute;
    runInAction(() => {
      this.conversationLoadVersion += 1;
      if (!shouldPreserveStoppingTurn) this.activeTurnGeneration += 1;
      this.stopStream();
      this.activeTurnTerminalReconciliation = null;
      this.activeTurnDetachedLoadVersion = shouldPreserveActiveTurn ? this.conversationLoadVersion : null;
      this.isWorking = shouldPreserveActiveTurn;
      this.streamStatus = shouldPreserveStoppingTurn ? "stopping" : shouldResumeActiveTurn ? "reconnecting" : "idle";
      if (shouldPreserveActiveTurn) {
        this.progressPhase = null;
        this.progressStartedAt = null;
      } else this.clearStreaming();
      if (!shouldPreserveActiveTurn) {
        this.activeTurnClientRequestId = null;
        this.activeTurnPageRoute = null;
      } else this.activeTurnPageRoute = resumePageRoute;
      this.conversationLoadPendingId = id;
      this.conversationLoadError = false;
      this.hasInSessionTerminalResult = false;
      this.olderMessagesCursor = null;
      this.olderMessagesPending = false;
    });
    const loadVersion = this.conversationLoadVersion;

    try {
      const data = await withDeadline(getAgentConversationAction(id), AGENT_CONVERSATION_LOAD_TIMEOUT_MS);
      if (!data) throw new Error("Conversation could not be loaded.");
      if (loadVersion !== this.conversationLoadVersion || this.conversationLoadPendingId !== id) return;
      const activeMessage = data.activeTurn
        ? data.messages.findLast((message) => message.role === "user" && message.turn?.status === "running")
        : undefined;
      const preservesLoadedActiveTurn = Boolean(
        shouldPreserveActiveTurn &&
          activeMessage?.turn?.clientRequestId &&
          activeMessage.turn.clientRequestId === resumeClientRequestId,
      );

      runInAction(() => {
        const stopSettlementPending = shouldPreserveActiveTurn && this.activeTurnStopRequested;
        this.conversationId = id;
        if (!preservesLoadedActiveTurn) {
          this.items = [];
          this.persistedAssistantMessageIds.clear();
          this.replayedAssistantMessageIds.clear();
          this.loadedMessageIds.clear();
          this.appendMessages(data.messages);
        }
        this.isWorking = Boolean(data.activeTurn || stopSettlementPending);
        this.isDraftConversationSelected = false;
        this.conversationLoadPendingId = null;
        this.isHistoryOpen = false;
        this.olderMessagesCursor = data.nextCursor;
        if (!data.activeTurn) {
          const latestTurn = data.messages.findLast((message) => message.role === "user" && message.turn)?.turn;
          this.activeTurnCompleted = stopSettlementPending || latestTurn?.status === "completed";
          this.activeTurnFailed = Boolean(latestTurn && latestTurn.terminalCode !== "completed");
          if (!stopSettlementPending) {
            this.activeTurnAdmissionConfirmed = false;
            this.activeTurnDetachedLoadVersion = null;
          }
        }
      });

      if (this.activeTurnStopRequested) return;
      if (data.activeTurn) {
        void this.reattachStream(
          id,
          loadVersion,
          preservesLoadedActiveTurn ? this.activeTurnGeneration : undefined,
          activeMessage?.turn?.clientRequestId ?? resumeClientRequestId,
          resumePageRoute,
          true,
        );
      } else if (this.queuedPrompt) {
        const generation = this.activeTurnGeneration;
        void this.loadConfig().then(() => this.settleQueuedPromptAfterReattach(id, generation, loadVersion));
      }
    } catch {
      if (loadVersion !== this.conversationLoadVersion) return;
      runInAction(() => {
        this.conversationLoadPendingId = null;
        this.conversationLoadError = true;
      });
      if (shouldPreserveActiveTurn && !this.activeTurnStopRequested) {
        void this.reattachStream(
          id,
          loadVersion,
          this.activeTurnGeneration,
          resumeClientRequestId,
          resumePageRoute,
          true,
        );
      }
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
      turn?: AgentMessageTurn | null;
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
      if (message.role === "user" && message.turn?.status === "uncertain") this.appendInterruptedTurn(message.id, at);
      if (message.role === "assistant") this.persistedAssistantMessageIds.add(message.id);
    }
  }

  private appendInterruptedTurn(messageId: string, at?: Date) {
    if (this.items.some((item) => item.kind === "turn_interrupted" && item.messageId === messageId)) return;
    this.items.push({
      kind: "turn_interrupted",
      id: nextItemId(),
      messageId,
      at,
    });
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
          text: stripRoutineTriggerBlock(part.text),
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
      let settledDetachedCancellation = false;
      let resumeDetachedTurn = false;
      let resumeLoadVersion = this.conversationLoadVersion;
      runInAction(() => {
        const detachedLoadVersion = this.activeTurnDetachedLoadVersion;
        const isDetachedReload =
          detachedLoadVersion !== null && detachedLoadVersion === this.conversationLoadVersion && !this.abortController;
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
          if (isDetachedReload) {
            if (this.activeTurnCompleted) {
              this.activeTurnDetachedLoadVersion = null;
              this.activeTurnAdmissionConfirmed = false;
              this.activeTurnStopRequested = false;
              this.hasInSessionTerminalResult = true;
              this.isWorking = false;
              this.activeTurnStopPromise = null;
              if (this.queuedPrompt) this.queuedPromptNeedsAttention = true;
              if (this.queuedPrompt && this.hasPendingRouteReload) this.routeSyncStatus = "waiting";
              this.streamStatus = "idle";
              settledDetachedCancellation = true;
            } else {
              if (this.conversationLoadPendingId) this.conversationLoadVersion += 1;
              this.conversationLoadPendingId = null;
              this.conversationLoadError = false;
              this.activeTurnDetachedLoadVersion = null;
              this.isWorking = true;
              this.streamStatus = "stopping";
              resumeLoadVersion = this.conversationLoadVersion;
              resumeDetachedTurn = true;
            }
          }
          return;
        }

        this.activeTurnStopRequested = false;
        if (isDetachedReload && this.activeTurnCompleted) {
          this.activeTurnDetachedLoadVersion = null;
          this.activeTurnAdmissionConfirmed = false;
          this.activeTurnStopPromise = null;
          this.isWorking = false;
          if (this.queuedPrompt) this.queuedPromptNeedsAttention = true;
          if (this.queuedPrompt && this.hasPendingRouteReload) this.routeSyncStatus = "waiting";
          this.streamStatus = "idle";
          settledDetachedCancellation = true;
        } else {
          this.streamStatus = this.activeTurnCompleted ? "finalizing" : "reconnecting";
          resumeLoadVersion = this.conversationLoadVersion;
          resumeDetachedTurn =
            isDetachedReload && this.conversationLoadPendingId === null && this.isWorking && !this.activeTurnCompleted;
        }
      });
      if (settledDetachedCancellation) {
        void this.loadConfig();
        if (!this.hasPendingRouteReload) void this.refreshConversations();
      }
      if (resumeDetachedTurn) {
        void this.reattachStream(
          conversationId,
          resumeLoadVersion,
          this.activeTurnGeneration,
          this.activeTurnClientRequestId ?? undefined,
          this.activeTurnPageRoute,
          true,
        );
      }
      if (outcome === "failed") this.toastError("AgentChat.errors.stopFailed");
    });
    activeController?.abort();
    runInAction(() => {
      this.streamStatus = "stopping";
      this.progressPhase = null;
    });
  };

  private requestActiveTurnCancellation = async (conversationId: string, generation: number) => {
    for (const delay of AGENT_CANCEL_RETRY_DELAYS_MS) {
      if (delay > 0) await waitFor(delay);
      if (generation !== this.activeTurnGeneration || this.activeTurnCompleted) return "inactive" as const;
      try {
        const result = await withDeadline(cancelAgentTurnAction({ conversationId }), AGENT_CANCEL_ATTEMPT_TIMEOUT_MS);
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
    this.progressPhase = null;
    this.progressStartedAt = null;
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
    let admissionDeadlineExpired = false;
    const turnGeneration = this.beginActiveTurnMutationTracking(messageId, pageRoute);
    const turnLoadVersion = this.conversationLoadVersion;

    try {
      const response = await fetchWithDeadline(
        "/api/agent/messages",
        {
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
        },
        controller,
        AGENT_ADMISSION_TIMEOUT_MS,
      );

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
        } else if (disposition === "uncertain" || disposition === "conflict") {
          if (disposition === "uncertain") runInAction(() => this.appendInterruptedTurn(messageId, new Date()));
          this.toastError("AgentChat.errors.sendFailed");
        }
        return;
      }

      runInAction(() => {
        this.activeTurnAdmissionConfirmed = true;
      });

      await this.followActiveTurn({
        conversationId: this.conversationId ?? conversationId,
        clientRequestId: messageId,
        generation: turnGeneration,
        initialBody: response.body,
        loadVersion: turnLoadVersion,
      });
    } catch (error) {
      if (turnGeneration !== this.activeTurnGeneration || turnLoadVersion !== this.conversationLoadVersion) return;
      admissionDeadlineExpired = (error as Error)?.name === "AgentFetchDeadlineError";
      const recoveryConversationId = this.conversationId ?? conversationId;
      if (
        recoveryConversationId &&
        this.activeTurnAdmissionConfirmed &&
        ((error as Error)?.name === "AbortError" || this.activeTurnDisposition === "stream")
      ) {
        await this.followActiveTurn({
          conversationId: recoveryConversationId,
          clientRequestId: messageId,
          generation: turnGeneration,
          initialBody: null,
          loadVersion: turnLoadVersion,
        });
      } else if ((error as Error)?.name === "AbortError" && this.activeTurnStopRequested)
        this.activeTurnCompleted = true;
      else {
        this.activeTurnFailed = true;
        this.activeTurnDisposition = "transport";
        this.toastError("AgentChat.errors.sendFailed");
      }
    } finally {
      if (turnGeneration !== this.activeTurnGeneration || turnLoadVersion !== this.conversationLoadVersion) return;

      let queued = this.queuedPrompt;
      let queuedConversationId = this.queuedPromptConversationId;
      let queuedMessageId = this.queuedPromptMessageId;
      let queuedPageRoute = this.queuedPromptPageRoute;
      const stopSettlementRequest = this.activeTurnStopPromise;
      let stopOwnsQueuedPrompt = Boolean(stopSettlementRequest);
      const runningConversationId = this.activeTurnDisposition === "running" ? this.conversationId : null;
      runInAction(() => {
        if (!this.activeTurnCompleted && this.activeTurnHasSuccessfulMutation)
          this.requestRouteRefreshForActiveTurn(null, true);
        this.clearStreaming();
        if (
          this.activeTurnFailed &&
          (!controller.signal.aborted || admissionDeadlineExpired) &&
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
        this.streamStatus = runningConversationId
          ? "reconnecting"
          : this.hasPendingRouteReload || queued
            ? "finalizing"
            : "idle";
      });

      const configRequest = this.loadConfig();
      if (!this.hasPendingRouteReload) void this.refreshConversations();
      await stopSettlementRequest;
      if (turnGeneration !== this.activeTurnGeneration || turnLoadVersion !== this.conversationLoadVersion) return;
      runInAction(() => {
        if (this.activeTurnStopPromise === stopSettlementRequest) this.activeTurnStopPromise = null;
      });
      if (!queued && !runningConversationId) return;

      await configRequest;
      if (turnGeneration !== this.activeTurnGeneration || turnLoadVersion !== this.conversationLoadVersion) return;
      const lateStopSettlementRequest = this.activeTurnStopPromise;
      await lateStopSettlementRequest;
      if (turnGeneration !== this.activeTurnGeneration || turnLoadVersion !== this.conversationLoadVersion) return;
      runInAction(() => {
        if (this.activeTurnStopPromise === lateStopSettlementRequest) this.activeTurnStopPromise = null;
      });
      stopOwnsQueuedPrompt ||= Boolean(lateStopSettlementRequest);
      queued = this.queuedPrompt;
      queuedConversationId = this.queuedPromptConversationId;
      queuedMessageId = this.queuedPromptMessageId;
      queuedPageRoute = this.queuedPromptPageRoute;

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
          !stopOwnsQueuedPrompt &&
          !this.usage?.blockedReason,
      );
      runInAction(() => {
        if (shouldSendQueued) {
          this.queuedPrompt = null;
          this.queuedPromptNeedsAttention = false;
          this.queuedPromptMessageId = null;
          this.queuedPromptConversationId = null;
          this.queuedPromptPageRoute = null;
        } else if (!runningConversationId || stopOwnsQueuedPrompt) {
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
        void this.rejoinBusyConversation(
          runningConversationId,
          {
            text: trimmed,
            messageId,
            pageRoute,
          },
          !stopOwnsQueuedPrompt,
        );
      }
    }
  };

  private rejoinBusyConversation = async (
    conversationId: string,
    resend: { text: string; messageId: string; pageRoute: string },
    resendAfterReattach = true,
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
    await this.reattachStream(conversationId, loadVersion, generation, resend.messageId);
    if (
      generation !== this.activeTurnGeneration ||
      loadVersion !== this.conversationLoadVersion ||
      this.conversationId !== conversationId
    )
      return;
    if (!resendAfterReattach) return;
    if (this.abortController || this.isWorking || this.activeTurnDisposition === "uncertain") return;
    runInAction(() => this.prepareCurrentTurnForReplay(resend.messageId));
    void this.sendMessage(resend.text, {
      appendUser: false,
      conversationId,
      messageId: resend.messageId,
      pageRoute: resend.pageRoute,
      retry: false,
      reconcileBusyTurn: true,
    });
  };

  private reattachStream = async (
    conversationId: string,
    loadVersion: number,
    existingGeneration?: number,
    clientRequestId?: string,
    pageRoute: string | null = null,
    ownsQueuedContinuation = existingGeneration === undefined,
  ) => {
    if (this.abortController) return;

    const generation = existingGeneration ?? this.beginActiveTurnMutationTracking(clientRequestId, pageRoute);
    runInAction(() => {
      this.activeTurnAdmissionConfirmed = true;
      this.isWorking = true;
    });

    try {
      await this.followActiveTurn({
        conversationId,
        clientRequestId,
        generation,
        initialBody: null,
        loadVersion,
      });
    } catch {
      if (loadVersion !== this.conversationLoadVersion) return;
    } finally {
      if (generation === this.activeTurnGeneration && loadVersion === this.conversationLoadVersion) {
        const stopSettlementRequest = this.activeTurnStopPromise;
        const stopOwnsQueuedPrompt = Boolean(stopSettlementRequest);
        runInAction(() => {
          this.abortController = null;
          this.isWorking = false;
          this.conversationLoadError = false;
          this.activeTurnDetachedLoadVersion = null;
          this.streamStatus = this.hasPendingRouteReload || this.queuedPrompt ? "finalizing" : "idle";
        });
        const configRequest = this.loadConfig();
        if (!this.hasPendingRouteReload) void this.refreshConversations();
        await stopSettlementRequest;
        if (generation !== this.activeTurnGeneration || loadVersion !== this.conversationLoadVersion) return;
        runInAction(() => {
          if (this.activeTurnStopPromise === stopSettlementRequest) this.activeTurnStopPromise = null;
        });
        if (ownsQueuedContinuation) {
          await configRequest;
          this.settleQueuedPromptAfterReattach(conversationId, generation, loadVersion, !stopOwnsQueuedPrompt);
        }
      }
    }
  };

  private settleQueuedPromptAfterReattach = (
    conversationId: string,
    generation: number,
    loadVersion: number,
    allowSend = true,
  ) => {
    if (
      generation !== this.activeTurnGeneration ||
      loadVersion !== this.conversationLoadVersion ||
      conversationId !== this.conversationId
    )
      return;
    const queued = this.queuedPrompt;
    const queuedConversationId = this.queuedPromptConversationId;
    const queuedMessageId = this.queuedPromptMessageId;
    const queuedPageRoute = this.queuedPromptPageRoute;
    if (!queued || !queuedMessageId || !queuedPageRoute) return;

    const queuedPromptIsCurrent =
      this.queuedPrompt === queued &&
      this.queuedPromptConversationId === queuedConversationId &&
      this.queuedPromptMessageId === queuedMessageId &&
      this.queuedPromptPageRoute === queuedPageRoute;
    const shouldSend =
      allowSend &&
      queuedPromptIsCurrent &&
      this.activeTurnCompleted &&
      !this.activeTurnFailed &&
      !this.usage?.blockedReason;
    runInAction(() => {
      if (shouldSend) {
        this.queuedPrompt = null;
        this.queuedPromptNeedsAttention = false;
        this.queuedPromptMessageId = null;
        this.queuedPromptConversationId = null;
        this.queuedPromptPageRoute = null;
      } else if (queuedPromptIsCurrent) {
        this.queuedPromptNeedsAttention = true;
        this.streamStatus = "idle";
      }
    });
    if (shouldSend) {
      void this.sendMessage(queued, {
        conversationId: queuedConversationId ?? conversationId,
        messageId: queuedMessageId,
        pageRoute: queuedPageRoute,
      });
    }
  };

  private followActiveTurn = async ({
    conversationId,
    clientRequestId,
    generation,
    initialBody,
    loadVersion,
  }: {
    conversationId: string | null;
    clientRequestId?: string;
    generation: number;
    initialBody: ReadableStream<Uint8Array> | null;
    loadVersion: number;
  }) => {
    let body = initialBody;
    let reconnectAttempt = 0;
    let reconnectImmediately = initialBody === null;
    let reconnectFailureReported = false;
    let reconnectSnapshotRequest: ReturnType<typeof getAgentConversationAction> | null = null;
    let reconnectSnapshotFailures = 0;
    let reconnectSnapshotRetryAt = 0;
    const reportReconnectFailure = (error: unknown) => {
      if (
        (error as Error)?.name === "AbortError" ||
        (error as Error)?.name === "AgentStreamInactivityError" ||
        reconnectFailureReported
      )
        return;
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
        if (this.activeTurnCompleted) {
          await this.activeTurnTerminalReconciliation;
          return;
        }
        if (this.activeTurnNextStreamIndex > indexBeforeRead) {
          reconnectAttempt = 0;
          reconnectSnapshotFailures = 0;
          reconnectSnapshotRetryAt = 0;
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

      if (
        !reconnectImmediately &&
        reconnectSnapshotFailures < AGENT_RECONNECT_SNAPSHOT_FAILURE_LIMIT &&
        Date.now() >= reconnectSnapshotRetryAt
      ) {
        let snapshot: Awaited<ReturnType<typeof getAgentConversationAction>> | null = null;
        try {
          reconnectSnapshotRequest ??= getAgentConversationAction(conversationId);
          const loadedSnapshot = await withDeadline(reconnectSnapshotRequest, AGENT_CONVERSATION_LOAD_TIMEOUT_MS);
          reconnectSnapshotRequest = null;
          if (!loadedSnapshot) throw new Error("The assistant conversation could not be recovered.");
          snapshot = loadedSnapshot;
          reconnectSnapshotFailures = 0;
          reconnectSnapshotRetryAt = 0;
        } catch {
          reconnectSnapshotRequest = null;
          reconnectSnapshotFailures += 1;
          if (reconnectSnapshotFailures >= AGENT_RECONNECT_SNAPSHOT_FAILURE_LIMIT) {
            runInAction(() => this.markActiveTurnRecoveryFailed(clientRequestId));
            return;
          }
          reconnectSnapshotRetryAt =
            Date.now() +
            (AGENT_STREAM_RECONNECT_DELAYS_MS[
              Math.min(reconnectSnapshotFailures - 1, AGENT_STREAM_RECONNECT_DELAYS_MS.length - 1)
            ] ?? 5000);
        }
        if (generation !== this.activeTurnGeneration || loadVersion !== this.conversationLoadVersion) return;
        if (snapshot && !snapshot.activeTurn) {
          runInAction(() => {
            const userMessage = snapshot.messages.findLast(
              (message) =>
                message.role === "user" &&
                Boolean(clientRequestId) &&
                message.turn?.clientRequestId === clientRequestId,
            );
            const turn = userMessage?.turn;
            const assistantMessage = snapshot.messages.find(
              (message) => message.role === "assistant" && message.id === turn?.assistantMessageId,
            );
            const replayable =
              turn?.status === "completed" &&
              turn.terminalCode !== null &&
              assistantMessage &&
              hasRenderableAgentMessageParts(clientSafeAgentMessageParts(assistantMessage.parts));
            const userIndex = this.items.findLastIndex(
              (item) =>
                item.kind === "user" &&
                (item.messageId === userMessage?.id || item.messageId === (clientRequestId ?? turn?.clientRequestId)),
            );
            const canReplaceCurrentTurn =
              userIndex >= 0 && !this.items.slice(userIndex + 1).some((item) => item.kind === "user");
            if (replayable && canReplaceCurrentTurn) {
              this.items = this.items.slice(0, userIndex + 1);
              this.loadedMessageIds.delete(assistantMessage.id);
              this.persistedAssistantMessageIds.delete(assistantMessage.id);
              this.recordReplayedMutations(clientSafeAgentMessageParts(assistantMessage.parts));
              this.appendMessages([assistantMessage]);
            } else {
              const noticeMessageId =
                userIndex >= 0
                  ? (this.items[userIndex] as Extract<AgentChatItem, { kind: "user" }>).messageId
                  : (clientRequestId ?? this.items.findLast((item) => item.kind === "user")?.messageId);
              if (noticeMessageId) this.appendInterruptedTurn(noticeMessageId, new Date());
            }
            this.activeTurnCompleted = true;
            this.activeTurnFailed = !replayable || !canReplaceCurrentTurn || turn.terminalCode !== "completed";
            this.activeTurnStopRequested = false;
            this.activeTurnDisposition = replayable && canReplaceCurrentTurn ? "stream" : "uncertain";
            this.hasInSessionTerminalResult = Boolean(replayable && canReplaceCurrentTurn);
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
        const response = await fetchWithDeadline(
          `/api/agent/conversations/${conversationId}/stream?startIndex=${this.activeTurnNextStreamIndex}`,
          {},
          controller,
          AGENT_RECONNECT_TIMEOUT_MS,
        );
        if (!response.ok || !response.body) throw new Error("The assistant run could not be rejoined.");
        runInAction(() => {
          this.conversationLoadError = false;
          this.activeTurnDetachedLoadVersion = null;
        });
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
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await readWithInactivityDeadline(reader);
      } catch (error) {
        void reader.cancel().catch(() => undefined);
        throw error;
      }
      const { done, value } = chunk;
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
        if (this.activeTurnCompleted) {
          void reader.cancel().catch(() => undefined);
          return;
        }
      }
    }
  };

  private reconcileTerminalAssistant = (assistantMessageId: string, terminalCode: unknown) => {
    const conversationId = this.conversationId;
    if (!conversationId) return;
    const generation = this.activeTurnGeneration;
    const loadVersion = this.conversationLoadVersion;
    const reconciliation = this.loadTerminalAssistant({
      assistantMessageId,
      conversationId,
      generation,
      loadVersion,
      allowRecoveryError: terminalCode !== "cancelled",
    });
    this.activeTurnTerminalReconciliation = reconciliation;
    const clearReconciliation = () => {
      if (this.activeTurnTerminalReconciliation === reconciliation) this.activeTurnTerminalReconciliation = null;
    };
    void reconciliation.then(clearReconciliation, clearReconciliation);
  };

  private loadTerminalAssistant = async ({
    assistantMessageId,
    conversationId,
    generation,
    loadVersion,
    allowRecoveryError,
  }: {
    assistantMessageId: string;
    conversationId: string;
    generation: number;
    loadVersion: number;
    allowRecoveryError: boolean;
  }) => {
    const snapshot = await withDeadline(
      getAgentConversationAction(conversationId),
      AGENT_TERMINAL_RECONCILE_TIMEOUT_MS,
    ).catch(() => null);
    if (
      generation !== this.activeTurnGeneration ||
      loadVersion !== this.conversationLoadVersion ||
      conversationId !== this.conversationId
    )
      return;

    const assistantMessage = snapshot?.messages.find(
      (message) => message.role === "assistant" && message.id === assistantMessageId,
    );
    const parts = assistantMessage ? clientSafeAgentMessageParts(assistantMessage.parts) : [];
    if (assistantMessage && hasRenderableAgentMessageParts(parts)) {
      runInAction(() => {
        const userIndex = this.items.findLastIndex((item) => item.kind === "user");
        if (userIndex < 0) return;
        this.items = this.items.slice(0, userIndex + 1);
        this.loadedMessageIds.delete(assistantMessage.id);
        this.persistedAssistantMessageIds.delete(assistantMessage.id);
        this.recordReplayedMutations(parts);
        this.appendMessages([assistantMessage]);
        this.clearStreaming();
      });
      return;
    }

    if (!allowRecoveryError) return;

    runInAction(() => this.markActiveTurnRecoveryFailed());
  };

  private markActiveTurnRecoveryFailed(clientRequestId?: string) {
    const userIndex = this.items.findLastIndex((item) => item.kind === "user");
    const user = this.items[userIndex];
    this.requestRouteRefreshForActiveTurn(null, this.activeTurnHasSuccessfulMutation);
    this.activeTurnCompleted = true;
    this.activeTurnFailed = true;
    this.activeTurnAdmissionConfirmed = false;
    this.activeTurnStopRequested = false;
    this.activeTurnDisposition = "transport";
    this.hasInSessionTerminalResult = false;
    this.clearStreaming();
    for (const item of this.items.slice(userIndex + 1)) {
      if (item.kind === "activity" && item.status === "running") item.status = "error";
      if (item.kind === "approval" && item.resolution === null) {
        item.pendingDecision = null;
        item.submittedDecision = null;
        item.retryDecision = null;
        item.resolution = "timeout";
      }
    }
    if (!user || user.kind !== "user") return;
    const requestId = clientRequestId ?? this.activeTurnClientRequestId ?? user.messageId;
    if (this.items.some((item) => item.kind === "turn_error" && item.messageId === requestId)) return;
    this.items.push({
      kind: "turn_error",
      id: nextItemId(),
      messageId: requestId,
      text: user.text,
      pageRoute: this.activeTurnPageRoute ?? (typeof window === "undefined" ? "/" : window.location.pathname),
      retry: false,
      at: new Date(),
    });
  }

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
      const result = await withDeadline(
        respondToApprovalAction({
          conversationId: this.conversationId,
          requestId: item.requestId,
          decision,
        }),
        AGENT_APPROVAL_ATTEMPT_TIMEOUT_MS,
      );
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
          const result = await withDeadline(
            respondToApprovalAction({
              conversationId,
              requestId: item.requestId,
              decision,
            }),
            AGENT_APPROVAL_ATTEMPT_TIMEOUT_MS,
          );
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
        case "progress": {
          if (
            this.activeTurnCompleted ||
            this.activeTurnFailed ||
            this.activeTurnStopRequested ||
            !this.isAwaitingAssistantResponse ||
            (event.phase !== "working" && event.phase !== "preparing_action")
          )
            break;
          this.progressPhase = event.phase;
          this.streamStatus = "working";
          break;
        }
        case "delta": {
          this.progressPhase = null;
          if (!this.activeTurnStopRequested) this.streamStatus = "working";
          this.currentAssistantItem().text += String(event.text ?? "");
          break;
        }
        case "message_replay": {
          this.progressPhase = null;
          const messageId = typeof event.messageId === "string" ? event.messageId : null;
          const parts = clientSafeAgentMessageParts(event.parts);
          this.recordReplayedMutations(parts);
          if (!messageId) break;
          this.replayedAssistantMessageIds.add(messageId);
          if (this.persistedAssistantMessageIds.has(messageId)) break;
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
          this.progressPhase = null;
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
          this.progressPhase = null;
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
          const assistantMessageId = typeof event.assistantMessageId === "string" ? event.assistantMessageId : null;
          this.activeTurnCompleted = true;
          this.activeTurnFailed = Boolean(event.isError);
          this.activeTurnStopRequested = false;
          this.hasInSessionTerminalResult = true;
          this.streamStatus = "finalizing";
          const activityStatus = event.terminalCode === "cancelled" ? "cancelled" : event.isError ? "error" : "done";
          const currentTurnStart = this.items.findLastIndex((item) => item.kind === "user");
          for (const item of this.items.slice(currentTurnStart + 1)) {
            if (item.kind === "activity" && item.status === "running") item.status = activityStatus;
            if (item.kind === "approval" && item.resolution === null) {
              item.pendingDecision = null;
              item.submittedDecision = null;
              item.retryDecision = null;
              item.resolution = event.terminalCode === "cancelled" ? "cancelled" : "timeout";
            }
          }
          this.clearStreaming();
          const resources = Array.isArray(event.affectedResources)
            ? event.affectedResources.filter((resource) =>
                AGENT_ACTIVITY_RESOURCES.includes(resource as (typeof AGENT_ACTIVITY_RESOURCES)[number]),
              )
            : [];
          this.requestRouteRefreshForActiveTurn(
            assistantMessageId,
            event.hasSuccessfulMutation === true || resources.length > 0,
          );
          if (assistantMessageId && !this.replayedAssistantMessageIds.has(assistantMessageId))
            this.reconcileTerminalAssistant(assistantMessageId, event.terminalCode);
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

  private beginActiveTurnMutationTracking(clientRequestId?: string, pageRoute: string | null = null) {
    this.activeTurnGeneration += 1;
    this.activeTurnCompleted = false;
    this.activeTurnFailed = false;
    this.hasInSessionTerminalResult = false;
    this.activeTurnHasSuccessfulMutation = false;
    this.activeTurnRefreshRequested = false;
    this.activeTurnNextStreamIndex = 0;
    this.activeTurnAdmissionConfirmed = false;
    this.activeTurnStopRequested = false;
    this.activeTurnStopPromise = null;
    this.activeTurnTerminalReconciliation = null;
    this.activeTurnClientRequestId = clientRequestId ?? null;
    this.activeTurnPageRoute = pageRoute;
    this.activeTurnDetachedLoadVersion = null;
    this.activeStreamKey = `stream-${++this.streamSequence}`;
    this.streamStatus = "working";
    this.progressPhase = "starting";
    this.progressStartedAt = Date.now();
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
