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

import { formatBytes } from "./attachment-classify";
import { MAX_ATTACHMENTS_BYTES, toAttachmentInput } from "./attachment-input";

export type NewThreadTarget = {
  connectedAccountId: string;
  recipientIdentifier: string;
  recipientDisplayName: string | null;
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

export class ThreadComposeStore extends BaseFormStore<ThreadComposeForm> {
  showCcBcc = false;
  editingDraftId: string | null = null;
  attachments: File[] = [];
  draftAttachments: File[] = [];
  pendingAttachments: Record<string, File[]> = {};
  newThreadTarget: NewThreadTarget | null = null;

  private onNewThreadSent: (() => void) | null = null;

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
    if (files.length === 0) return;

    const total = [...this.attachments, ...files].reduce((sum, file) => sum + file.size, 0);
    if (total > MAX_ATTACHMENTS_BYTES) {
      this.toastError("Inbox.compose.attachTooLarge", { values: { max: formatBytes(MAX_ATTACHMENTS_BYTES) } });
      return;
    }

    this.attachments = [...this.attachments, ...files];
  };

  removeAttachment = (index: number) => {
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
      .safeParse({ recipients: this.form.recipients, cc: this.form.cc, bcc: this.form.bcc });

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
    this.showCcBcc = !this.showCcBcc;
  };

  initialize = (init: {
    provider: MessagingProvider;
    threadId: string;
    defaultSubject?: string | null;
    defaultRecipients?: string[];
    defaultCc?: string[];
  }) => {
    const subject = init.defaultSubject?.startsWith("Re:")
      ? init.defaultSubject
      : `Re: ${init.defaultSubject ?? ""}`.trim();
    this.showCcBcc = (init.defaultCc?.length ?? 0) > 0;
    this.editingDraftId = null;
    this.attachments = [];
    this.draftAttachments = [];
    this.newThreadTarget = null;
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
    if (this.newThreadTarget) this.newThreadTarget = { ...this.newThreadTarget, connectedAccountId };
    this.form.linkedinProduct = "classic";
    this.form.inmailSignature = "";
  };

  initializeNewThread = (init: {
    provider: MessagingProvider;
    connectedAccountId: string;
    recipientIdentifier: string;
    recipientDisplayName: string | null;
    onSent?: () => void;
  }) => {
    this.showCcBcc = false;
    this.editingDraftId = null;
    this.attachments = [];
    this.draftAttachments = [];
    this.onNewThreadSent = init.onSent ?? null;
    this.newThreadTarget = {
      connectedAccountId: init.connectedAccountId,
      recipientIdentifier: init.recipientIdentifier,
      recipientDisplayName: init.recipientDisplayName,
    };
    this.onInitOrRefresh({
      provider: init.provider,
      threadId: "",
      recipients: [init.recipientIdentifier],
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
    const attendee = (value: string) => ({ attendeeId: value, identifier: value, displayName: null });

    return {
      id: opts.id ?? `temp:${crypto.randomUUID()}`,
      messagingThreadId: this.form.threadId,
      connectedAccountId: detail.thread?.connectedAccountId ?? "",
      providerMessageId: null,
      provider: this.form.provider as MessagingProvider,
      direction: "outbound",
      sender: { attendeeId: "", identifier: "", displayName: null, isSelf: true },
      recipients: {
        to: this.form.recipients.map(attendee),
        cc: this.form.cc.map(attendee),
        bcc: this.form.bcc.map(attendee),
      },
      subject: this.isEmail ? this.form.subject : null,
      bodyText: this.form.body,
      bodyHtml: this.isEmail ? this.form.body : null,
      attachmentsMeta: [],
      isEvent: false,
      isDeleted: false,
      isHidden: false,
      isDraft: opts.isDraft,
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
    if (this.isNewThread) return this.sendNewThread();
    if (!this.form.threadId || (!this.form.body.trim() && this.attachments.length === 0)) return;
    if (!this.validateEmails(true)) return;

    const detail = this.rootStore.messagingThreadDetailStore;
    const draftId = this.editingDraftId;
    const optimistic = this.buildOptimisticMessage({ isDraft: false, id: draftId ?? undefined });
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
      if (files.length) this.pendingAttachments = { ...this.pendingAttachments, [tempId]: files };
      this.form.body = "";
      this.form.cc = [];
      this.form.bcc = [];
      this.attachments = [];
      this.draftAttachments = [];
      this.editingDraftId = null;
    });

    this.setIsLoading(true);
    try {
      const attachments = files.length ? await Promise.all(files.map(toAttachmentInput)) : undefined;
      const result = this.isEmail
        ? await sendEmailAction({
            threadId: this.form.threadId,
            to: snapshot.recipients
              .map((value) => value.trim())
              .filter((value) => value.includes("@"))
              .map((value) => ({ identifier: value })),
            cc: snapshot.cc.length ? snapshot.cc : undefined,
            bcc: snapshot.bcc.length ? snapshot.bcc : undefined,
            subject: snapshot.subject,
            body: snapshot.body,
            attachments,
            draftMessageId: draftId ?? undefined,
          })
        : await sendChatMessageAction({
            threadId: this.form.threadId,
            text: snapshot.body,
            attachments,
            draftMessageId: draftId ?? undefined,
          });

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
    } catch {
      runInAction(() => detail.setMessageStatus(tempId, "failed"));
      this.toastError("Common.notifications.unexpectedError");
    } finally {
      runInAction(() => this.setIsLoading(false));
    }
  };

  private sendNewThread = async (): Promise<void> => {
    const target = this.newThreadTarget;
    if (!target) return;
    if (!this.validateEmails()) return;

    this.setIsLoading(true);
    try {
      const attachments = this.attachments.length
        ? await Promise.all(this.attachments.map(toAttachmentInput))
        : undefined;
      const result = this.isEmail
        ? await sendEmailAction({
            connectedAccountId: target.connectedAccountId,
            to: [
              {
                identifier: target.recipientIdentifier,
                display_name: target.recipientDisplayName ?? undefined,
              },
            ],
            cc: this.form.cc.length ? this.form.cc : undefined,
            bcc: this.form.bcc.length ? this.form.bcc : undefined,
            subject: this.form.subject.trim(),
            body: this.form.body,
            attachments,
          })
        : await startChatAction({
            connectedAccountId: target.connectedAccountId,
            attendeeIdentifiers: [target.recipientIdentifier],
            text: this.form.body,
            attachments,
            ...(this.isLinkedin && this.form.linkedinProduct !== "classic"
              ? {
                  linkedinProduct: this.form.linkedinProduct,
                  inmailSubject: this.form.subject.trim() || undefined,
                  inmailSignature:
                    this.form.linkedinProduct === "recruiter"
                      ? this.form.inmailSignature.trim() || undefined
                      : undefined,
                }
              : {}),
          });

      if (!result.ok) {
        const tree = this.toComposeError(result.error);
        this.setError(tree);
        if (!toastZodErrorTree(tree)) this.toastError("Common.notifications.unexpectedError");
        return;
      }

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

      this.toastSuccess("Inbox.compose.newThreadSent");
      this.onNewThreadSent?.();
    } catch {
      this.toastError("Common.notifications.unexpectedError");
    } finally {
      runInAction(() => this.setIsLoading(false));
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
    if (!this.form.threadId || !this.form.body.trim()) return;
    if (!this.validateEmails()) return;

    const detail = this.rootStore.messagingThreadDetailStore;

    this.setIsLoading(true);
    try {
      const result = await saveDraftAction({
        threadId: this.form.threadId,
        subject: this.isEmail ? this.form.subject : undefined,
        body: this.form.body,
        cc: this.isEmail && this.form.cc.length ? this.form.cc : undefined,
        bcc: this.isEmail && this.form.bcc.length ? this.form.bcc : undefined,
      });

      if (!result.ok) {
        this.setError(result.error);
        return;
      }

      const draft = result.data;
      runInAction(() => {
        if (detail.messages.some((message) => message.id === draft.id)) detail.replaceMessageById(draft.id, draft);
        else detail.appendMessage(draft);
        this.form.body = "";
        this.form.cc = [];
        this.form.bcc = [];
        this.draftAttachments = [...this.attachments];
        this.attachments = [];
        this.editingDraftId = null;
      });
    } finally {
      runInAction(() => this.setIsLoading(false));
    }
  };

  loadDraft = (draft: MessagingMessageDto) => {
    runInAction(() => {
      this.form.subject = draft.subject ?? this.form.subject;
      this.form.body = draft.bodyText ?? "";
      this.form.cc = draft.recipients.cc.map((attendee) => attendee.identifier).filter(Boolean);
      this.form.bcc = draft.recipients.bcc.map((attendee) => attendee.identifier).filter(Boolean);
      this.attachments = [...this.draftAttachments];
      this.editingDraftId = draft.id;
      this.showCcBcc = this.isEmail && (this.form.cc.length > 0 || this.form.bcc.length > 0);
      this.rootStore.messagingThreadDetailStore.removeMessageById(draft.id);
    });
  };

  discardDraft = async (messageId: string): Promise<void> => {
    const detail = this.rootStore.messagingThreadDetailStore;
    const removed = detail.messages.find((message) => message.id === messageId);

    runInAction(() => {
      detail.removeMessageById(messageId);
      this.draftAttachments = [];
      if (this.editingDraftId === messageId) {
        this.editingDraftId = null;
        this.form.body = "";
        this.form.cc = [];
        this.form.bcc = [];
        this.attachments = [];
      }
    });

    const result = await discardDraftAction({ messageId });
    if (!result.ok) {
      runInAction(() => {
        if (removed) detail.appendMessage(removed);
      });
      this.toastError("Inbox.compose.draftDiscardFailed");
      return;
    }
  };

  retrySend = async (messageId: string): Promise<void> => {
    const detail = this.rootStore.messagingThreadDetailStore;
    const message = detail.messages.find((entry) => entry.id === messageId);
    if (!message || !this.form.threadId) return;

    runInAction(() => detail.setMessageStatus(messageId, "sending"));
    this.setIsLoading(true);
    try {
      const files = this.pendingAttachments[messageId] ?? [];
      const attachments = files.length ? await Promise.all(files.map(toAttachmentInput)) : undefined;
      const result = this.isEmail
        ? await sendEmailAction({
            threadId: this.form.threadId,
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
            attachments,
          })
        : await sendChatMessageAction({ threadId: this.form.threadId, text: message.bodyText ?? "", attachments });

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
    } catch {
      runInAction(() => detail.setMessageStatus(messageId, "failed"));
      this.toastError("Common.notifications.unexpectedError");
    } finally {
      runInAction(() => this.setIsLoading(false));
    }
  };
}
