import type { MessagingProvider } from "@/generated/prisma";
import type { RootStore } from "@/core/stores/root.store";
import type { MessagingMessageDto } from "@/ee/messaging/inbox/inbox.schema";
import type { LinkedinProduct } from "@/ee/messaging/provider";
import type { $ZodErrorTree } from "zod/v4/core";

import { action, computed, makeObservable, observable, runInAction } from "mobx";
import { z } from "zod";

import {
  sendChatMessageAction,
  sendEmailAction,
  saveDraftAction,
  discardDraftAction,
  startChatAction,
} from "../actions";

import { BaseFormStore } from "@/core/base/base-form.store";
import { isEmailProvider } from "@/ee/messaging/provider";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { defaultEmailSettings } from "@/ee/messaging/email-settings";
import { composeEmailBodies } from "@/ee/messaging/outbound/email-signature";

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

export class ThreadComposeStore extends BaseFormStore<ThreadComposeForm> {
  showCcBcc = false;
  editingDraftId: string | null = null;
  editingDraftRevision: string | null = null;
  attachments: File[] = [];
  draftAttachments: File[] = [];
  pendingAttachments: Record<string, File[]> = {};
  newThreadTarget: NewThreadTarget | null = null;

  private onNewThreadDone: (() => void) | null = null;
  private retryDraftBindings = new Map<string, { messageId: string; revision: string }>();
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

    makeObservable(this, {
      showCcBcc: observable,
      editingDraftId: observable,
      editingDraftRevision: observable,
      attachments: observable,
      draftAttachments: observable,
      pendingAttachments: observable,
      newThreadTarget: observable,
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

    const result = z
      .object({
        recipients: requireRecipients ? z.array(z.email()).min(1) : z.array(z.email()),
        cc: z.array(z.email()),
        bcc: z.array(z.email()),
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
  }) => {
    this.composeGeneration += 1;
    this.showCcBcc = false;
    this.editingDraftId = null;
    this.editingDraftRevision = null;
    this.attachments = [];
    this.draftAttachments = [];
    this.onNewThreadDone = init.onDone ?? null;
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

  send = async (): Promise<void> => {
    if (this.isLoading) return;
    if (this.isNewThread) return this.sendNewThread();
    if (!this.form.threadId || (!this.form.body.trim() && this.attachments.length === 0)) return;
    if (!this.validateEmails(true)) return;

    const detail = this.rootStore.messagingThreadDetailStore;
    const generation = this.composeGeneration;
    const isEmail = this.isEmail;
    const threadId = this.form.threadId;
    const draftId = this.editingDraftId;
    const draftRevision = this.editingDraftRevision;
    const optimistic = this.buildOptimisticMessage({
      isDraft: false,
      id: draftId ?? undefined,
    });
    const tempId = optimistic.id;
    const files = [...this.attachments];
    const snapshot = {
      body: this.form.body,
      cc: [...this.form.cc],
      bcc: [...this.form.bcc],
      subject: this.form.subject,
      recipients: [...this.form.recipients],
    };

    runInAction(() => {
      if (draftId && detail.messages.some((message) => message.id === draftId))
        detail.replaceMessageById(draftId, optimistic);
      else detail.appendMessage(optimistic);

      detail.setMessageStatus(tempId, "sending");
      if (files.length) {
        this.pendingAttachments = {
          ...this.pendingAttachments,
          [tempId]: files,
        };
      }

      this.form.body = "";
      this.form.cc = [];
      this.form.bcc = [];
      this.attachments = [];
      this.draftAttachments = [];
      this.editingDraftId = null;
      this.editingDraftRevision = null;
    });
    if (draftId && draftRevision) {
      this.retryDraftBindings.set(tempId, {
        messageId: draftId,
        revision: draftRevision,
      });
    }

    this.setIsLoading(true);
    try {
      const attachments = files.length ? await Promise.all(files.map(toAttachmentInput)) : undefined;
      const result = isEmail
        ? await sendEmailAction({
            threadId,
            to: snapshot.recipients
              .map((value) => value.trim())
              .filter((value) => value.includes("@"))
              .map((value) => ({ identifier: value })),
            cc: snapshot.cc.length ? snapshot.cc : undefined,
            bcc: snapshot.bcc.length ? snapshot.bcc : undefined,
            subject: snapshot.subject,
            body: snapshot.body,
            bodyFormat: "markdown",
            attachments,
            ...(draftId && draftRevision ? { draftMessageId: draftId, draftRevision } : {}),
          })
        : await sendChatMessageAction({
            threadId,
            text: snapshot.body,
            attachments,
            ...(draftId && draftRevision ? { draftMessageId: draftId, draftRevision } : {}),
          });

      if (generation !== this.composeGeneration) return;

      if (!result.ok) {
        runInAction(() => detail.setMessageStatus(tempId, "failed"));
        if (!toastZodErrorTree(result.error)) this.toastError("Common.notifications.unexpectedError");
        return;
      }

      const sent = result.data;
      runInAction(() => {
        if (sent) detail.replaceMessageById(tempId, sent);
        else detail.removeMessageById(tempId);
        detail.clearMessageStatus(tempId);
        this.clearPending(tempId);
      });
      this.retryDraftBindings.delete(tempId);
    } catch {
      if (generation !== this.composeGeneration) return;
      runInAction(() => detail.setMessageStatus(tempId, "failed"));
      this.toastError("Common.notifications.unexpectedError");
    } finally {
      if (generation === this.composeGeneration) runInAction(() => this.setIsLoading(false));
      else {
        runInAction(() => this.clearPending(tempId));
        this.retryDraftBindings.delete(tempId);
      }
    }
  };

  private sendNewThread = async (): Promise<void> => {
    const target = this.newThreadTarget;
    if (!target) return;
    if (!this.validateEmails()) return;

    const generation = this.composeGeneration;
    const onDone = this.onNewThreadDone;
    const draftBinding =
      this.editingDraftId && this.editingDraftRevision
        ? {
            draftMessageId: this.editingDraftId,
            draftRevision: this.editingDraftRevision,
          }
        : {};
    const snapshot = {
      provider: this.form.provider,
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

    this.setIsLoading(true);
    try {
      const attachments = snapshot.files.length ? await Promise.all(snapshot.files.map(toAttachmentInput)) : undefined;
      const result = snapshot.isEmail
        ? await sendEmailAction({
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
        : await startChatAction({
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
                    snapshot.linkedinProduct === "recruiter" ? snapshot.inmailSignature.trim() || undefined : undefined,
                }
              : {}),
          });

      if (
        generation !== this.composeGeneration ||
        this.newThreadTarget?.connectedAccountId !== target.connectedAccountId ||
        this.form.provider !== snapshot.provider
      )
        return;

      if (!result.ok) {
        const tree = this.toComposeError(result.error);
        this.setError(tree);
        if (!toastZodErrorTree(tree)) this.toastError("Common.notifications.unexpectedError");
        return;
      }

      const draftUnchanged =
        this.form.body === snapshot.body &&
        this.form.subject === snapshot.subject &&
        sameValues(this.form.recipients, snapshot.recipients) &&
        sameValues(this.form.cc, snapshot.cc) &&
        sameValues(this.form.bcc, snapshot.bcc) &&
        this.form.linkedinProduct === snapshot.linkedinProduct &&
        this.form.inmailSignature === snapshot.inmailSignature &&
        this.attachments.length === snapshot.files.length &&
        this.attachments.every((file, index) => file === snapshot.files[index]);

      if (draftUnchanged) {
        runInAction(() => {
          if (this.error) this.setError(undefined);
          this.form.body = "";
          this.form.subject = "";
          this.form.cc = [];
          this.form.bcc = [];
          this.form.linkedinProduct = "classic";
          this.form.inmailSignature = "";
          this.attachments = [];
        });
      }

      if (
        draftBinding.draftMessageId &&
        this.editingDraftId === draftBinding.draftMessageId &&
        this.editingDraftRevision === draftBinding.draftRevision
      ) {
        runInAction(() => {
          this.editingDraftId = null;
          this.editingDraftRevision = null;
          if (this.newThreadTarget?.draftThreadId) {
            const targetWithoutDraft = { ...this.newThreadTarget };
            delete targetWithoutDraft.draftThreadId;
            this.newThreadTarget = targetWithoutDraft;
          }
        });
      }

      this.toastSuccess("Inbox.compose.newThreadSent");
      if (draftUnchanged) onDone?.();
    } catch {
      if (generation !== this.composeGeneration) return;
      this.toastError("Common.notifications.unexpectedError");
    } finally {
      if (generation === this.composeGeneration) runInAction(() => this.setIsLoading(false));
    }
  };

  private toComposeError(error: unknown): $ZodErrorTree<ThreadComposeForm> {
    const tree = error as { properties?: Record<string, unknown> };
    if (!tree?.properties?.text && !tree?.properties?.inmailSubject) return error as $ZodErrorTree<ThreadComposeForm>;

    const properties: Record<string, unknown> = { ...tree.properties };
    if (properties.text) {
      properties.body = properties.text;
      delete properties.text;
    }
    if (properties.inmailSubject) {
      properties.subject = properties.inmailSubject;
      delete properties.inmailSubject;
    }
    return { ...tree, properties } as $ZodErrorTree<ThreadComposeForm>;
  }

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
          this.form.subject = "";
          this.form.cc = [];
          this.form.bcc = [];
          this.draftAttachments = [...this.attachments];
          this.attachments = [];
          this.editingDraftId = null;
          this.editingDraftRevision = null;
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
    if (this.isLoading) return;
    runInAction(() => {
      this.form.subject = draft.subject ?? this.form.subject;
      this.form.body = draft.bodyText ?? "";
      const recipients = draft.recipients.to.map((attendee) => attendee.identifier).filter(Boolean);
      if (recipients.length > 0) this.form.recipients = recipients;
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
    if (this.isLoading) return;
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

    const result = await discardDraftAction({ messageId, draftRevision });
    if (!result.ok && generation === this.composeGeneration) {
      runInAction(() => {
        if (removed) detail.appendMessage(removed);
      });
      this.toastError("Inbox.compose.draftDiscardFailed");
      return;
    }
  };

  retrySend = async (messageId: string): Promise<void> => {
    if (this.isLoading) return;
    const detail = this.rootStore.messagingThreadDetailStore;
    const message = detail.messages.find((entry) => entry.id === messageId);
    if (!message || !this.form.threadId) return;
    const generation = this.composeGeneration;
    const isEmail = this.isEmail;
    const threadId = this.form.threadId;
    const draftBinding = this.retryDraftBindings.get(messageId);

    runInAction(() => detail.setMessageStatus(messageId, "sending"));
    this.setIsLoading(true);
    try {
      const files = this.pendingAttachments[messageId] ?? [];
      const attachments = files.length ? await Promise.all(files.map(toAttachmentInput)) : undefined;
      const result = isEmail
        ? await sendEmailAction({
            threadId,
            to: message.recipients.to
              .map((attendee) => attendee.identifier)
              .filter((value) => value.includes("@"))
              .map((value) => ({ identifier: value })),
            cc: message.recipients.cc.length ? message.recipients.cc.map((attendee) => attendee.identifier) : undefined,
            bcc: message.recipients.bcc.length
              ? message.recipients.bcc.map((attendee) => attendee.identifier)
              : undefined,
            subject: message.subject ?? "",
            body: message.bodyText ?? "",
            bodyFormat: "markdown",
            attachments,
            ...(draftBinding
              ? {
                  draftMessageId: draftBinding.messageId,
                  draftRevision: draftBinding.revision,
                }
              : {}),
          })
        : await sendChatMessageAction({
            threadId,
            text: message.bodyText ?? "",
            attachments,
            ...(draftBinding
              ? {
                  draftMessageId: draftBinding.messageId,
                  draftRevision: draftBinding.revision,
                }
              : {}),
          });

      if (generation !== this.composeGeneration) return;

      if (!result.ok) {
        runInAction(() => detail.setMessageStatus(messageId, "failed"));
        if (!toastZodErrorTree(result.error)) this.toastError("Common.notifications.unexpectedError");
        return;
      }

      const sent = result.data;
      runInAction(() => {
        if (sent) detail.replaceMessageById(messageId, sent);
        else detail.removeMessageById(messageId);
        detail.clearMessageStatus(messageId);
        this.clearPending(messageId);
      });
      this.retryDraftBindings.delete(messageId);
    } catch {
      if (generation !== this.composeGeneration) return;
      runInAction(() => detail.setMessageStatus(messageId, "failed"));
      this.toastError("Common.notifications.unexpectedError");
    } finally {
      if (generation === this.composeGeneration) runInAction(() => this.setIsLoading(false));
      else {
        runInAction(() => this.clearPending(messageId));
        this.retryDraftBindings.delete(messageId);
      }
    }
  };
}
