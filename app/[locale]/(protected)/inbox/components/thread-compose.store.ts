import type { MessagingProvider } from "@/generated/prisma";
import type { RootStore } from "@/core/stores/root.store";

import { action, computed, makeObservable, observable, runInAction } from "mobx";

import { sendChatMessageAction, sendEmailAction } from "../actions";

import { BaseFormStore } from "@/core/base/base-form.store";
import { isEmailProvider } from "@/ee/messaging/provider-icon";

export class ThreadComposeStore extends BaseFormStore<{
  provider: MessagingProvider | null;
  threadId: string;
  recipients: string[];
  body: string;
  subject: string;
  cc: string[];
  bcc: string[];
}> {
  showCcBcc = false;

  constructor(rootStore: RootStore) {
    super(rootStore, {
      provider: null,
      threadId: "",
      recipients: [],
      body: "",
      subject: "",
      cc: [],
      bcc: [],
    });

    makeObservable(this, {
      showCcBcc: observable,
      isEmail: computed,
      toggleCcBcc: action,
      initialize: action,
      send: action,
    });
  }

  get isEmail(): boolean {
    return this.form.provider ? isEmailProvider(this.form.provider) : false;
  }

  toggleCcBcc = () => {
    this.showCcBcc = !this.showCcBcc;
  };

  initialize = (init: {
    provider: MessagingProvider;
    threadId: string;
    defaultSubject?: string | null;
    defaultRecipients?: string[];
  }) => {
    const subject = init.defaultSubject?.startsWith("Re:")
      ? init.defaultSubject
      : `Re: ${init.defaultSubject ?? ""}`.trim();
    this.showCcBcc = false;
    this.onInitOrRefresh({
      provider: init.provider,
      threadId: init.threadId,
      recipients: init.defaultRecipients ?? [],
      body: "",
      subject,
      cc: [],
      bcc: [],
    });
  };

  send = async (): Promise<void> => {
    if (!this.form.threadId) return;

    this.setIsLoading(true);
    try {
      if (this.isEmail) {
        const to = this.form.recipients
          .map((r) => r.trim())
          .filter((r) => r.includes("@"))
          .map((r) => ({ identifier: r }));
        const result = await sendEmailAction({
          threadId: this.form.threadId,
          to,
          cc: this.form.cc.length ? this.form.cc : undefined,
          bcc: this.form.bcc.length ? this.form.bcc : undefined,
          subject: this.form.subject,
          body: this.form.body,
        });
        if (!result.ok) {
          this.setError(result.error);
          return;
        }
      } else {
        const result = await sendChatMessageAction({
          threadId: this.form.threadId,
          text: this.form.body,
        });
        if (!result.ok) {
          this.setError(result.error);
          return;
        }
      }
      runInAction(() => {
        this.form.body = "";
        this.form.cc = [];
        this.form.bcc = [];
      });
      this.toastSuccess("Inbox.compose.sendQueuedTitle", {
        descriptionKey: "Inbox.compose.sendQueuedDescription",
      });
      void this.rootStore.messagingThreadDetailStore.refresh();
    } finally {
      runInAction(() => {
        this.setIsLoading(false);
      });
    }
  };
}
