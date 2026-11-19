import type { RootStore } from "@/core/stores/root.store";
import type { ReviewDraft } from "@/ee/messaging/outbound/list-review-drafts.interactor";

import { action, computed, makeObservable, observable, runInAction } from "mobx";
import { toast } from "sonner";

import { BaseStore } from "@/core/base/base.store";
import { reportApplicationError } from "@/core/errors/report-application-error";
import { notifyIfWorkspaceChanged } from "@/core/errors/workspace-changed-notice";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { isDraftThreadId, isEmailProvider } from "@/ee/messaging/provider";

import { countReviewDraftsAction, discardDraftAction, listReviewDraftsAction, saveDraftAction } from "../actions";
import { isSendableDraft, sendSavedDraft } from "./send-saved-draft";

type ReviewStatus = "idle" | "loading" | "ready" | "error";

const STALE_DRAFT_CODES = new Set<string>([
  CustomErrorCode.draftChanged,
  CustomErrorCode.draftRecipientsChanged,
  CustomErrorCode.draftAlreadySent,
  CustomErrorCode.draftMessageNotFound,
  CustomErrorCode.draftTargetMismatch,
  CustomErrorCode.draftSendInProgress,
  CustomErrorCode.draftSendOutcomeUnknown,
]);

export function draftRecipients(item: ReviewDraft): string[] {
  const saved = item.draft.recipients.to.map((recipient) => recipient.identifier).filter(Boolean);
  if (saved.length > 0 || isEmailProvider(item.draft.provider)) return saved;

  return item.thread.participants
    .filter((participant) => !participant.isSelf && participant.identifier)
    .map((participant) => participant.identifier);
}

export class DraftReviewStore extends BaseStore {
  isOpen = false;
  status: ReviewStatus = "idle";
  queue: ReviewDraft[] = [];
  openCount = 0;
  sentCount = 0;
  keptCount = 0;
  busy = false;
  editing = false;
  editBody = "";
  private generation = 0;
  private countGeneration = 0;
  private keptIds = new Set<string>();

  constructor(root: RootStore) {
    super(root);
    makeObservable(this, {
      isOpen: observable,
      status: observable,
      queue: observable.ref,
      openCount: observable,
      sentCount: observable,
      keptCount: observable,
      busy: observable,
      editing: observable,
      editBody: observable,
      current: computed,
      remaining: computed,
      canSend: computed,
      editDirty: computed,
      open: action,
      close: action,
      keep: action,
      bringToFront: action,
      startEdit: action,
      cancelEdit: action,
      setEditBody: action,
      setOpenCount: action,
    });
  }

  setOpenCount = (count: number) => {
    this.countGeneration += 1;
    this.openCount = count;
  };

  get current(): ReviewDraft | null {
    return this.queue[0] ?? null;
  }

  get remaining(): number {
    return this.queue.length;
  }

  get editDirty(): boolean {
    const body = this.editBody.trim();
    return this.editing && body !== "" && body !== (this.current?.draft.bodyText ?? "").trim();
  }

  get canSend(): boolean {
    const item = this.current;
    if (!item || this.busy || this.editing) return false;
    return Boolean(item.draft.bodyText?.trim()) && isSendableDraft(item.draft);
  }

  open = () => {
    this.isOpen = true;
    this.sentCount = 0;
    this.keptCount = 0;
    this.editing = false;
    this.keptIds.clear();
    void this.load();
  };

  close = () => {
    this.isOpen = false;
    this.generation += 1;
    this.queue = [];
    this.status = "idle";
    this.busy = false;
    this.editing = false;
    void this.refreshCount().catch(reportApplicationError);
  };

  load = async (): Promise<void> => {
    const generation = ++this.generation;
    runInAction(() => {
      this.status = "loading";
    });
    try {
      const result = await listReviewDraftsAction();
      if (generation !== this.generation) return;
      if (!result.ok) {
        runInAction(() => {
          this.status = "error";
        });
        if (!notifyIfWorkspaceChanged(result)) toastZodErrorTree(result.error);
        return;
      }
      runInAction(() => {
        this.queue = result.data.items.filter((entry) => !this.keptIds.has(entry.draft.id));
        this.openCount = result.data.total;
        this.status = "ready";
        this.editing = false;
      });
    } catch (error) {
      if (generation !== this.generation) return;
      runInAction(() => {
        this.status = "error";
      });
      reportApplicationError(error);
    }
  };

  refreshCount = async (): Promise<void> => {
    const generation = ++this.countGeneration;
    const result = await countReviewDraftsAction();
    if (generation !== this.countGeneration || !result.ok) return;
    runInAction(() => {
      this.openCount = result.data.total;
    });
  };

  keep = () => {
    const item = this.current;
    if (!item || this.busy) return;
    this.editing = false;
    this.keptIds.add(item.draft.id);
    this.queue = this.queue.slice(1);
    this.keptCount += 1;
  };

  bringToFront = (draftId: string) => {
    const index = this.queue.findIndex((entry) => entry.draft.id === draftId);
    if (index <= 0 || this.busy || this.editing) return;
    this.queue = [this.queue[index], ...this.queue.slice(0, index), ...this.queue.slice(index + 1)];
  };

  private refuse = (result: { error: unknown }) => {
    if (notifyIfWorkspaceChanged(result)) return;
    if (!toastZodErrorTree(result.error)) this.toastError("ErrorCard.unexpectedError");
  };

  startEdit = () => {
    const item = this.current;
    if (!item || this.busy) return;
    this.editBody = item.draft.bodyText ?? "";
    this.editing = true;
  };

  cancelEdit = () => {
    this.editing = false;
  };

  setEditBody = (value: string) => {
    this.editBody = value;
  };

  saveEdit = async (): Promise<void> => {
    const item = this.current;
    const body = this.editBody.trim();
    if (!item || this.busy || !body) return;
    if (body === (item.draft.bodyText ?? "").trim()) {
      this.cancelEdit();
      return;
    }

    const generation = this.generation;
    const email = isEmailProvider(item.draft.provider);
    const recipients = draftRecipients(item);
    runInAction(() => {
      this.busy = true;
    });
    try {
      const result = await saveDraftAction({
        threadId: item.thread.id,
        body,
        ...(email || recipients.length > 0 ? { recipients } : {}),
        ...(email
          ? {
              subject: item.draft.subject ?? undefined,
              cc: item.draft.recipients.cc.map((recipient) => recipient.identifier),
              bcc: item.draft.recipients.bcc.map((recipient) => recipient.identifier),
            }
          : {}),
      });
      if (generation !== this.generation) return;
      if (!result.ok) {
        this.refuse(result);
        return;
      }
      runInAction(() => {
        this.queue = this.queue.map((entry) =>
          entry.draft.id === item.draft.id ? { ...entry, draft: result.data } : entry,
        );
        this.editing = false;
      });
    } catch (error) {
      reportApplicationError(error);
    } finally {
      runInAction(() => {
        this.busy = false;
      });
    }
  };

  send = async (): Promise<void> => {
    const item = this.current;
    if (!item || !this.canSend || !isSendableDraft(item.draft)) return;
    if (isEmailProvider(item.draft.provider) && !item.draft.subject?.trim()) {
      this.toastError("Common.errors.subjectRequired");
      return;
    }

    const generation = this.generation;
    const draft = item.draft;
    runInAction(() => {
      this.busy = true;
    });
    try {
      const result = await sendSavedDraft(draft, {
        newThread: isDraftThreadId(item.thread.unipileThreadId),
        recipients: draftRecipients(item),
      });
      if (!result.ok) {
        const code = "code" in result ? result.code : undefined;
        this.refuse(result);
        if (code && STALE_DRAFT_CODES.has(code) && generation === this.generation) await this.load();
        return;
      }
      const recorded = Boolean(result.data.message || result.data.messageId) || !isEmailProvider(draft.provider);
      toast.success(
        result.data.repeated
          ? this.t("Inbox.compose.draftSentEarlier")
          : recorded
            ? this.t("Inbox.compose.messageSent")
            : this.t("Inbox.compose.messageSentPendingSync"),
        { duration: 4000 },
      );
      this.rootStore.messagingThreadsStore.refreshInBackground();
      if (this.rootStore.messagingThreadDetailStore.thread?.id === item.thread.id)
        void this.rootStore.messagingThreadDetailStore.refresh(true);
      if (generation !== this.generation) return;
      runInAction(() => {
        this.queue = this.queue.filter((entry) => entry.draft.id !== draft.id);
        this.sentCount += 1;
        this.openCount = Math.max(0, this.openCount - 1);
      });
    } catch (error) {
      reportApplicationError(error, { description: this.t("Inbox.compose.sendOutcomeUnknown") });
      if (generation === this.generation) await this.load();
    } finally {
      runInAction(() => {
        this.busy = false;
      });
    }
  };

  discard = async (): Promise<void> => {
    const item = this.current;
    if (!item || this.busy || !item.draft.draftRevision) return;

    const generation = this.generation;
    runInAction(() => {
      this.busy = true;
    });
    try {
      const result = await discardDraftAction({ messageId: item.draft.id, draftRevision: item.draft.draftRevision });
      if (!result.ok) {
        if (!notifyIfWorkspaceChanged(result)) this.toastError("Inbox.compose.draftDiscardFailed");
        if (generation === this.generation) await this.load();
        return;
      }
      this.rootStore.messagingThreadsStore.refreshInBackground();
      if (this.rootStore.messagingThreadDetailStore.thread?.id === item.thread.id)
        void this.rootStore.messagingThreadDetailStore.refresh(true);
      if (generation !== this.generation) return;
      runInAction(() => {
        this.queue = this.queue.filter((entry) => entry.draft.id !== item.draft.id);
        this.openCount = Math.max(0, this.openCount - 1);
        this.editing = false;
      });
    } catch (error) {
      reportApplicationError(error);
    } finally {
      runInAction(() => {
        this.busy = false;
      });
    }
  };
}
