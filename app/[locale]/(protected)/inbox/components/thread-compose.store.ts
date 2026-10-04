import type { MessagingProvider } from "@/generated/prisma";
import type { RootStore } from "@/core/stores/root.store";
import type { MessagingMessageDto } from "@/ee/messaging/inbox/inbox.schema";
import type { LinkedinProduct } from "@/ee/messaging/provider";
import type { $ZodErrorTree } from "zod/v4/core";
import type { SendAttachment } from "@/ee/messaging/outbound/send-email.interactor";

import { action, computed, makeObservable, observable, runInAction } from "mobx";
import { z } from "zod";
import { toast } from "sonner";

import {
  sendChatMessageAction,
  sendEmailAction,
  saveDraftAction,
  discardDraftAction,
  startChatAction,
} from "../actions";

import { BaseFormStore } from "@/core/base/base-form.store";
import { isDraftThreadId, isEmailProvider } from "@/ee/messaging/provider";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { defaultEmailSettings } from "@/ee/messaging/email-settings";
import { composeEmailBodies } from "@/ee/messaging/outbound/email-signature";
import { reportApplicationError, runUserAction } from "@/core/errors/report-application-error";

import { formatBytes } from "./attachment-classify";
import { MAX_ATTACHMENTS_BYTES, toAttachmentInput } from "./attachment-input";

export type NewThreadTarget = {
  connectedAccountId: string;
  recipients: Array<{ identifier: string; displayName: string | null }>;
  draftThreadId?: string;
};

type ThreadComposeForm = {
  provider: MessagingProvider | null;
  threadId: string;
  recipients: string[];
  body: string;
  subject: string;
  cc: string[];
  bcc: string[];
  linkedinProduct: LinkedinProduct;
  inmailSignature: string;
};

function sameValues(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

type DeliveryResult =
  | Awaited<ReturnType<typeof sendEmailAction>>
  | Awaited<ReturnType<typeof sendChatMessageAction>>
  | Awaited<ReturnType<typeof startChatAction>>;

type PendingDelivery = {
  message: MessagingMessageDto;
  files: File[];
  status: "sending" | "failed";
  retryable?: boolean;
  send: (attachments: SendAttachment[] | undefined) => Promise<DeliveryResult>;
  onSent?: (threadId: string | null) => void;
};

export class ThreadComposeStore extends BaseFormStore<ThreadComposeForm> {
  showCcBcc = false;
  editingDraftId: string | null = null;
  editingDraftRevision: string | null = null;
  attachments: File[] = [];
  draftAttachments: File[] = [];
  pendingAttachments: Record<string, File[]> = {};
  newThreadTarget: NewThreadTarget | null = null;
  submissionVersion = 0;
  private pendingDeliveries = new Map<string, PendingDelivery>();

  private onNewThreadDone: (() => void) | null = null;
  private onNewThreadSent: ((threadId: string | null) => void) | null = null;
  private composeGeneration = 0;

  constructor(rootStore: RootStore) {
    super(rootStore, {
      provider: null,
      threadId: "",
      recipients: [],
      body: "",
      subject: "",
      cc: [],
      bcc: [],
      linkedinProduct: "classic",
      inmailSignature: "",
    });

    makeObservable<this, "pendingDeliveries">(this, {
      showCcBcc: observable,
      editingDraftId: observable,
      editingDraftRevision: observable,
      attachments: observable,
      draftAttachments: observable,
      pendingAttachments: observable,
      newThreadTarget: observable,
      submissionVersion: observable,
      pendingDeliveries: observable.shallow,
      isEmail: computed,
      isLinkedin: computed,
      isNewThread: computed,
      hasComposedContent: computed,
      toggleCcBcc: action,
      addAttachments: action,
      removeAttachment: action,
      initialize: action,
      initializeNewThread: action,
      setNewThreadAccount: action,
      send: action,
      sendDraft: action,
      saveDraft: action,
      loadDraft: action,
      discardDraft: action,
      retrySend: action,
    });
  }

  get isNewThread(): boolean {
    return !this.form.threadId && this.newThreadTarget !== null;
  }

  get hasComposedContent(): boolean {
    return this.form.body.trim().length > 0 || this.attachments.length > 0;
  }

  addAttachments = (files: File[]) => {
    if (this.isLoading) return;
    if (files.length === 0) return;

    const total = [...this.attachments, ...files].reduce((sum, file) => sum + file.size, 0);
    if (total > MAX_ATTACHMENTS_BYTES) {
      this.toastError("Inbox.compose.attachTooLarge", {
        values: { max: formatBytes(MAX_ATTACHMENTS_BYTES) },
      });
      return;
    }

    this.attachments = [...this.attachments, ...files];
  };

  removeAttachment = (index: number) => {
    if (this.isLoading) return;
    this.attachments = this.attachments.filter((_, i) => i !== index);
  };

  private validateEmails(requireRecipients = false): boolean {
    if (!this.isEmail) return true;

    const error = this.t("Common.errors.invalidEmail");
    const email = z.email({ error });
    const result = z
      .object({
        recipients: z.array(email),
        cc: z.array(email),
        bcc: z.array(email),
      })
      .superRefine((value, ctx) => {
        if (requireRecipients && value.recipients.length + value.cc.length + value.bcc.length === 0) {
          ctx.addIssue({
            code: "custom",
            message: this.t("Common.errors.emailRecipientsRequired"),
            path: ["recipients"],
          });
        }
      })
      .safeParse({
        recipients: this.form.recipients,
        cc: this.form.cc,
        bcc: this.form.bcc,
      });

    if (result.success) {
      if (this.error) this.setError(undefined);
      return true;
    }

    this.setError(z.treeifyError(result.error) as $ZodErrorTree<typeof this.form>);
    return false;
  }

  private validateSend(): boolean {
    if (!this.validateEmails(true)) return false;
    if (this.isEmail && !this.form.subject.trim()) {
      this.setError({ errors: [], properties: { subject: { errors: [this.t("Common.errors.subjectRequired")] } } });
      return false;
    }
    if (this.isNewThread && this.isLinkedin && this.form.linkedinProduct !== "classic") {
      if (!this.form.subject.trim()) {
        this.setError({
          errors: [],
          properties: { subject: { errors: [this.t("Common.errors.inmailSubjectRequired")] } },
        });
        return false;
      }
      if (this.form.linkedinProduct === "recruiter" && !this.form.inmailSignature.trim()) {
        this.setError({
          errors: [],
          properties: { inmailSignature: { errors: [this.t("Common.errors.inmailSignatureRequired")] } },
        });
        return false;
      }
    }
    return true;
  }

  get isEmail(): boolean {
    return this.form.provider ? isEmailProvider(this.form.provider) : false;
  }

  get isLinkedin(): boolean {
    return this.form.provider === "linkedin";
  }

  toggleCcBcc = () => {
    if (this.isLoading) return;
    this.showCcBcc = !this.showCcBcc;
  };

  initialize = (init: {
    provider: MessagingProvider;
    threadId: string;
    defaultSubject?: string | null;
    defaultRecipients?: string[];
    defaultCc?: string[];
  }) => {
    this.composeGeneration += 1;
    const subject = init.defaultSubject?.startsWith("Re:")
      ? init.defaultSubject
      : `Re: ${init.defaultSubject ?? ""}`.trim();
    this.showCcBcc = (init.defaultCc?.length ?? 0) > 0;
    this.editingDraftId = null;
    this.editingDraftRevision = null;
    this.attachments = [];
    this.draftAttachments = [];
    this.newThreadTarget = null;
    this.onNewThreadDone = null;
    this.onNewThreadSent = null;
    this.onInitOrRefresh({
      provider: init.provider,
      threadId: init.threadId,
      recipients: init.defaultRecipients ?? [],
      body: "",
      subject,
      cc: init.defaultCc ?? [],
      bcc: [],
      linkedinProduct: "classic",
      inmailSignature: "",
    });
  };

  setNewThreadAccount = (connectedAccountId: string) => {
    if (this.isLoading) return;
    if (this.newThreadTarget?.draftThreadId) return;
    if (this.newThreadTarget) this.newThreadTarget = { ...this.newThreadTarget, connectedAccountId };
    this.form.linkedinProduct = "classic";
    this.form.inmailSignature = "";
  };

  initializeNewThread = (init: {
    provider: MessagingProvider;
    connectedAccountId: string;
    recipients: Array<{ identifier: string; displayName: string | null }>;
    draftThreadId?: string;
    onDone?: () => void;
    onSent?: (threadId: string | null) => void;
  }) => {
    this.composeGeneration += 1;
    this.showCcBcc = false;
    this.editingDraftId = null;
    this.editingDraftRevision = null;
    this.attachments = [];
    this.draftAttachments = [];
    this.onNewThreadDone = init.onDone ?? null;
    this.onNewThreadSent = init.onSent ?? null;
    this.newThreadTarget = {
      connectedAccountId: init.connectedAccountId,
      recipients: init.recipients,
      draftThreadId: init.draftThreadId,
    };
    this.onInitOrRefresh({
      provider: init.provider,
      threadId: "",
      recipients: init.recipients.map((recipient) => recipient.identifier),
      body: "",
      subject: "",
      cc: [],
      bcc: [],
      linkedinProduct: "classic",
      inmailSignature: "",
    });
  };

  private buildOptimisticMessage = (opts: { isDraft: boolean; id?: string }): MessagingMessageDto => {
    const detail = this.rootStore.messagingThreadDetailStore;
    const attendee = (value: string) => ({
      attendeeId: value,
      identifier: value,
      displayName: null,
    });
    const connectedAccountId = this.newThreadTarget?.connectedAccountId ?? detail.thread?.connectedAccountId ?? "";
    const account = this.rootStore.connectedAccountsStore.items.find((item) => item.id === connectedAccountId);
    const bodyHtml = this.isEmail
      ? composeEmailBodies(
          this.form.body,
          account?.signature,
          account?.emailSettings ?? defaultEmailSettings(),
          "markdown",
        ).html
      : null;

    return {
      id: opts.id ?? `temp:${crypto.randomUUID()}`,
      messagingThreadId: this.form.threadId,
      connectedAccountId,
      providerMessageId: null,
      provider: this.form.provider as MessagingProvider,
      direction: "outbound",
      sender: {
        attendeeId: "",
        identifier: "",
        displayName: null,
        isSelf: true,
      },
      recipients: {
        to: this.form.recipients.map(attendee),
        cc: this.form.cc.map(attendee),
        bcc: this.form.bcc.map(attendee),
      },
      subject: this.isEmail ? this.form.subject : null,
      bodyText: this.form.body,
      bodyHtml,
      attachmentsMeta: [],
      isEvent: false,
      isDeleted: false,
      isHidden: false,
      isDraft: opts.isDraft,
      draftRevision: null,
      sentAt: new Date(),
      editedAt: null,
      reactions: [],
    };
  };

  private clearPending = (id: string) => {
    if (!(id in this.pendingAttachments)) return;
    this.pendingAttachments = Object.fromEntries(Object.entries(this.pendingAttachments).filter(([key]) => key !== id));
  };

  getPendingMessages = (threadId: string): MessagingMessageDto[] =>
    [...this.pendingDeliveries.values()]
      .filter((delivery) => delivery.message.messagingThreadId === threadId)
      .map((delivery) => delivery.message);

  getDeliveryStatus = (messageId: string): "sending" | "failed" | undefined =>
    this.pendingDeliveries.get(messageId)?.status;

  private displayDelivery = (delivery: PendingDelivery) => {
    const detail = this.rootStore.messagingThreadDetailStore;
    if (detail.thread?.id !== delivery.message.messagingThreadId) return;
    if (detail.messages.some((message) => message.id === delivery.message.id))
      detail.replaceMessageById(delivery.message.id, delivery.message);
    else detail.appendMessage(delivery.message);
    detail.setMessageStatus(delivery.message.id, delivery.status);
  };

  private deliver = async (delivery: PendingDelivery): Promise<void> => {
    const id = delivery.message.id;
    if (this.pendingDeliveries.get(id)?.status === "sending") return;
    runInAction(() => {
      this.pendingDeliveries.set(id, { ...delivery, status: "sending" });
      if (delivery.files.length) this.pendingAttachments = { ...this.pendingAttachments, [id]: delivery.files };
      this.displayDelivery({ ...delivery, status: "sending" });
    });
    const toastId = `send:${id}`;
    toast.info(this.t("Inbox.compose.sendStarted"), {
      id: toastId,
      duration: 4000,
      action: undefined,
      description: this.t("Inbox.compose.sendInBackground"),
    });
    const options = {
      id: toastId,
      duration: Infinity,
      description: undefined,
      action: {
        label: this.t("Inbox.compose.retry"),
        onClick: () => runUserAction(() => this.retrySend(id)),
      },
    };
    const finalOptions = { ...options, action: undefined };

    const failed = (retryable: boolean) =>
      runInAction(() => {
        const next = { ...delivery, status: "failed" as const, retryable };
        this.pendingDeliveries.set(id, next);
        this.displayDelivery(next);
      });

    let dispatched = false;
    let delivered = false;
    try {
      const attachments = delivery.files.length ? await Promise.all(delivery.files.map(toAttachmentInput)) : undefined;
      dispatched = true;
      const result = await delivery.send(attachments);
      if (!result.ok) {
        const retryable = "retryable" in result && result.retryable === true;
        const toastOptions = retryable ? options : finalOptions;
        failed(retryable);
        if (!toastZodErrorTree(result.error, toastOptions))
          toast.error(this.t("ErrorCard.unexpectedError"), toastOptions);
        return;
      }

      const sent = result.data && "messagingThreadId" in result.data ? result.data : null;
      const sentThreadId = result.data
        ? "messagingThreadId" in result.data
          ? result.data.messagingThreadId
          : result.data.threadId
        : null;
      runInAction(() => {
        this.pendingDeliveries.delete(id);
        this.clearPending(id);
        const detail = this.rootStore.messagingThreadDetailStore;
        if (detail.thread?.id === delivery.message.messagingThreadId) {
          if (sent && sent.messagingThreadId === detail.thread.id) detail.replaceMessageById(id, sent);
          else detail.removeMessageById(id);
          detail.clearMessageStatus(id);
        }
      });
      delivered = true;
      this.rootStore.messagingThreadsStore.refreshInBackground();
      toast.success(this.t("Inbox.compose.messageSent"), {
        id: toastId,
        duration: 4000,
        action: undefined,
        description: undefined,
      });
      runUserAction(() => runInAction(() => delivery.onSent?.(sentThreadId)));
    } catch (error) {
      if (delivered) {
        reportApplicationError(error);
        return;
      }
      failed(!dispatched);
      reportApplicationError(
        error,
        dispatched ? { ...finalOptions, description: this.t("Inbox.compose.sendOutcomeUnknown") } : options,
      );
    }
  };

  canRetry = (messageId: string): boolean => this.pendingDeliveries.get(messageId)?.retryable !== false;

  send = async (): Promise<void> => {
    if (this.isLoading) return;
    if (this.isNewThread) return this.sendNewThread();
    if (!this.form.threadId || (!this.form.body.trim() && this.attachments.length === 0)) return;
    if (!this.validateSend()) return;

    const isEmail = this.isEmail;
    const threadId = this.form.threadId;
    const draftBinding =
      this.editingDraftId && this.editingDraftRevision
        ? { draftMessageId: this.editingDraftId, draftRevision: this.editingDraftRevision }
        : {};
    const message = this.buildOptimisticMessage({ isDraft: false, id: this.editingDraftId ?? undefined });
    const files = [...this.attachments];
    const snapshot = {
      body: this.form.body,
      cc: [...this.form.cc],
      bcc: [...this.form.bcc],
      subject: this.form.subject,
      recipients: [...this.form.recipients],
    };
    runInAction(() => {
      this.form.body = "";
      this.form.cc = [];
      this.form.bcc = [];
      this.attachments = [];
      this.draftAttachments = [];
      this.editingDraftId = null;
      this.editingDraftRevision = null;
      this.submissionVersion += 1;
      this.onInitOrRefresh(this.form);
    });
    return this.deliver({
      message,
      files,
      status: "sending",
      send: (attachments) =>
        isEmail
          ? sendEmailAction({
              threadId,
              to: snapshot.recipients.map((identifier) => ({ identifier })),
              cc: snapshot.cc.length ? snapshot.cc : undefined,
              bcc: snapshot.bcc.length ? snapshot.bcc : undefined,
              subject: snapshot.subject,
              body: snapshot.body,
              bodyFormat: "markdown",
              attachments,
              ...draftBinding,
            })
          : sendChatMessageAction({ threadId, text: snapshot.body, attachments, ...draftBinding }),
    });
  };

  private sendNewThread = async (): Promise<void> => {
    const target = this.newThreadTarget;
    if (!target || !this.validateSend()) return;
    if (!this.form.body.trim() && this.attachments.length === 0) return;
    const generation = this.composeGeneration;
    const onDone = this.onNewThreadDone;
    const onSent = this.onNewThreadSent;
    const draftBinding =
      this.editingDraftId && this.editingDraftRevision
        ? { draftMessageId: this.editingDraftId, draftRevision: this.editingDraftRevision }
        : {};
    const snapshot = {
      isEmail: this.isEmail,
      isLinkedin: this.isLinkedin,
      recipients: [...this.form.recipients],
      body: this.form.body,
      subject: this.form.subject,
      cc: [...this.form.cc],
      bcc: [...this.form.bcc],
      linkedinProduct: this.form.linkedinProduct,
      inmailSignature: this.form.inmailSignature,
      files: [...this.attachments],
    };
    const message = this.buildOptimisticMessage({ isDraft: false, id: this.editingDraftId ?? undefined });
    message.messagingThreadId = target.draftThreadId ?? "";
    runInAction(() => {
      this.form.body = "";
      this.form.subject = "";
      this.form.cc = [];
      this.form.bcc = [];
      this.form.linkedinProduct = "classic";
      this.form.inmailSignature = "";
      this.attachments = [];
      this.draftAttachments = [];
      this.editingDraftId = null;
      this.editingDraftRevision = null;
      this.submissionVersion += 1;
      if (target.draftThreadId) this.newThreadTarget = { ...target, draftThreadId: undefined };
      this.onInitOrRefresh(this.form);
    });
    const sending = this.deliver({
      message,
      files: snapshot.files,
      status: "sending",
      send: (attachments) =>
        snapshot.isEmail
          ? sendEmailAction({
              connectedAccountId: target.connectedAccountId,
              to: snapshot.recipients.map((identifier) => ({
                identifier,
                display_name:
                  target.recipients.find((recipient) => recipient.identifier === identifier)?.displayName ?? undefined,
              })),
              cc: snapshot.cc.length ? snapshot.cc : undefined,
              bcc: snapshot.bcc.length ? snapshot.bcc : undefined,
              subject: snapshot.subject.trim(),
              body: snapshot.body,
              bodyFormat: "markdown",
              attachments,
              ...draftBinding,
            })
          : startChatAction({
              connectedAccountId: target.connectedAccountId,
              attendeeIdentifiers: snapshot.recipients,
              text: snapshot.body,
              attachments,
              ...draftBinding,
              ...(snapshot.isLinkedin && snapshot.linkedinProduct !== "classic"
                ? {
                    linkedinProduct: snapshot.linkedinProduct,
                    inmailSubject: snapshot.subject.trim() || undefined,
                    inmailSignature:
                      snapshot.linkedinProduct === "recruiter"
                        ? snapshot.inmailSignature.trim() || undefined
                        : undefined,
                  }
                : {}),
            }),
      onSent: (threadId) => {
        if (generation !== this.composeGeneration || this.hasUnsavedChanges || this.hasComposedContent) return;
        if (this.newThreadTarget?.connectedAccountId !== target.connectedAccountId) return;
        onSent?.(threadId);
      },
    });
    onDone?.();
    return sending;
  };

  sendDraft = async (draft: MessagingMessageDto): Promise<void> => {
    if (!draft.draftRevision || this.pendingDeliveries.get(draft.id)?.status === "sending") return;
    if (isEmailProvider(draft.provider) && !draft.subject?.trim()) {
      this.toastError("Common.errors.subjectRequired");
      return;
    }
    const detail = this.rootStore.messagingThreadDetailStore;
    const newThread = detail.thread?.id === draft.messagingThreadId && isDraftThreadId(detail.thread.unipileThreadId);
    const generation = this.composeGeneration;
    const onSent = this.onNewThreadSent;
    const draftBinding = { draftMessageId: draft.id, draftRevision: draft.draftRevision };
    const email = isEmailProvider(draft.provider);
    const recipients =
      email || draft.recipients.to.length
        ? draft.recipients.to.map((recipient) => recipient.identifier)
        : detail.thread?.id === draft.messagingThreadId
          ? [...this.form.recipients]
          : [];
    if (newThread && this.newThreadTarget?.draftThreadId === draft.messagingThreadId)
      this.newThreadTarget = { ...this.newThreadTarget, draftThreadId: undefined };
    return this.deliver({
      message: { ...draft, isDraft: false, draftRevision: null },
      files: [],
      status: "sending",
      send: (attachments) =>
        email
          ? sendEmailAction({
              ...(newThread ? { connectedAccountId: draft.connectedAccountId } : { threadId: draft.messagingThreadId }),
              to: recipients.map((identifier) => ({ identifier })),
              cc: draft.recipients.cc.length ? draft.recipients.cc.map((recipient) => recipient.identifier) : undefined,
              bcc: draft.recipients.bcc.length
                ? draft.recipients.bcc.map((recipient) => recipient.identifier)
                : undefined,
              subject: draft.subject ?? "",
              body: draft.bodyText ?? "",
              bodyFormat: "markdown",
              attachments,
              ...draftBinding,
            })
          : newThread
            ? startChatAction({
                connectedAccountId: draft.connectedAccountId,
                attendeeIdentifiers: recipients,
                text: draft.bodyText ?? "",
                attachments,
                ...draftBinding,
              })
            : sendChatMessageAction({
                threadId: draft.messagingThreadId,
                text: draft.bodyText ?? "",
                attachments,
                ...draftBinding,
              }),
      onSent: newThread
        ? (threadId) => {
            if (generation !== this.composeGeneration || this.hasUnsavedChanges || this.hasComposedContent) return;
            if (this.newThreadTarget?.connectedAccountId !== draft.connectedAccountId) return;
            onSent?.(threadId);
          }
        : undefined,
    });
  };

  saveDraft = async (): Promise<void> => {
    if (this.isLoading) return;
    if (!this.form.body.trim()) return;
    if (this.isLinkedin && this.isNewThread && this.form.linkedinProduct !== "classic") return;
    if (this.attachments.length > 0) {
      this.toastError("Inbox.compose.draftAttachmentsUnsupported");
      return;
    }

    const target = this.newThreadTarget;
    const threadId = this.form.threadId;
    const draftThreadId = threadId || target?.draftThreadId;
    if (!draftThreadId && !target) return;
    if (!this.validateEmails()) return;

    const detail = this.rootStore.messagingThreadDetailStore;
    const generation = this.composeGeneration;
    const onDone = this.onNewThreadDone;
    const snapshot = {
      provider: this.form.provider,
      recipients: [...this.form.recipients],
      subject: this.form.subject,
      body: this.form.body,
      cc: [...this.form.cc],
      bcc: [...this.form.bcc],
      isEmail: this.isEmail,
    };

    this.setIsLoading(true);
    try {
      const result = await saveDraftAction({
        ...(draftThreadId ? { threadId: draftThreadId } : { connectedAccountId: target?.connectedAccountId }),
        recipients: snapshot.recipients,
        subject: snapshot.isEmail ? snapshot.subject : undefined,
        body: snapshot.body,
        cc: snapshot.isEmail && snapshot.cc.length ? snapshot.cc : undefined,
        bcc: snapshot.isEmail && snapshot.bcc.length ? snapshot.bcc : undefined,
      });

      const activeContext =
        generation === this.composeGeneration &&
        this.form.provider === snapshot.provider &&
        this.form.threadId === threadId &&
        (this.newThreadTarget?.connectedAccountId ?? null) === (target?.connectedAccountId ?? null);
      if (!activeContext) return;

      if (!result.ok) {
        this.setError(result.error);
        return;
      }

      const draft = result.data;
      const draftUnchanged =
        this.form.subject === snapshot.subject &&
        this.form.body === snapshot.body &&
        sameValues(this.form.recipients, snapshot.recipients) &&
        sameValues(this.form.cc, snapshot.cc) &&
        sameValues(this.form.bcc, snapshot.bcc);
      runInAction(() => {
        if (draftThreadId) {
          if (detail.messages.some((message) => message.id === draft.id)) detail.replaceMessageById(draft.id, draft);
          else detail.appendMessage(draft);
        }
        if (draftUnchanged) {
          this.form.body = "";
          if (!threadId) this.form.subject = "";
          this.form.cc = [];
          this.form.bcc = [];
          this.draftAttachments = [...this.attachments];
          this.attachments = [];
          this.editingDraftId = null;
          this.editingDraftRevision = null;
          this.onInitOrRefresh(this.form);
        }
      });

      if (!threadId) {
        this.toastSuccess("Inbox.compose.draftSaved");
        if (draftUnchanged) onDone?.();
      }
    } finally {
      if (generation === this.composeGeneration) runInAction(() => this.setIsLoading(false));
    }
  };

  loadDraft = (draft: MessagingMessageDto) => {
    if (this.isLoading || this.pendingDeliveries.get(draft.id)?.status === "sending") return;
    runInAction(() => {
      this.form.subject = draft.subject ?? this.form.subject;
      this.form.body = draft.bodyText ?? "";
      const recipients = draft.recipients.to.map((attendee) => attendee.identifier).filter(Boolean);
      if (this.isEmail || recipients.length > 0) this.form.recipients = recipients;
      this.form.cc = draft.recipients.cc.map((attendee) => attendee.identifier).filter(Boolean);
      this.form.bcc = draft.recipients.bcc.map((attendee) => attendee.identifier).filter(Boolean);
      this.attachments = [...this.draftAttachments];
      this.editingDraftId = draft.id;
      this.editingDraftRevision = draft.draftRevision;
      this.showCcBcc = this.isEmail && (this.form.cc.length > 0 || this.form.bcc.length > 0);
      this.rootStore.messagingThreadDetailStore.removeMessageById(draft.id);
    });
  };

  discardDraft = async (messageId: string, draftRevision: string): Promise<void> => {
    if (this.isLoading || this.pendingDeliveries.get(messageId)?.status === "sending") return;
    const detail = this.rootStore.messagingThreadDetailStore;
    const generation = this.composeGeneration;
    const removed = detail.messages.find((message) => message.id === messageId);

    runInAction(() => {
      detail.removeMessageById(messageId);
      this.draftAttachments = [];
      if (this.editingDraftId === messageId) {
        this.editingDraftId = null;
        this.editingDraftRevision = null;
        this.form.body = "";
        this.form.cc = [];
        this.form.bcc = [];
        this.attachments = [];
      }
    });

    try {
      const result = await discardDraftAction({ messageId, draftRevision });
      if (result.ok) this.rootStore.messagingThreadsStore.refreshInBackground();
      else if (generation === this.composeGeneration) {
        runInAction(() => {
          if (removed) detail.appendMessage(removed);
        });
        this.toastError("Inbox.compose.draftDiscardFailed");
      }
    } catch (error) {
      if (generation === this.composeGeneration) {
        runInAction(() => {
          if (removed) detail.appendMessage(removed);
        });
      }
      reportApplicationError(error);
    }
  };

  retrySend = async (messageId: string): Promise<void> => {
    const pending = this.pendingDeliveries.get(messageId);
    if (pending) {
      if (pending.status !== "sending") await this.deliver(pending);
      return;
    }
    const message = this.rootStore.messagingThreadDetailStore.messages.find((entry) => entry.id === messageId);
    if (!message) return;
    const email = isEmailProvider(message.provider);
    await this.deliver({
      message,
      files: this.pendingAttachments[messageId] ?? [],
      status: "failed",
      send: (attachments) =>
        email
          ? sendEmailAction({
              threadId: message.messagingThreadId,
              to: message.recipients.to.map((recipient) => ({ identifier: recipient.identifier })),
              cc: message.recipients.cc.length
                ? message.recipients.cc.map((recipient) => recipient.identifier)
                : undefined,
              bcc: message.recipients.bcc.length
                ? message.recipients.bcc.map((recipient) => recipient.identifier)
                : undefined,
              subject: message.subject ?? "",
              body: message.bodyText ?? "",
              bodyFormat: "markdown",
              attachments,
            })
          : sendChatMessageAction({ threadId: message.messagingThreadId, text: message.bodyText ?? "", attachments }),
    });
  };
}
