import type { FormEvent } from "react";
import type { RootStore } from "@/core/stores/root.store";
import type { ConnectedAccountDto } from "@/ee/messaging/messaging.schema";

import { action, computed, makeObservable, observable } from "mobx";

import type { MessagingProvider } from "@/generated/prisma";

import { sendEmailAction, startChatAction } from "@/app/[locale]/(protected)/inbox/actions";

import { BaseModalStore } from "@/core/base/base-modal.store";
import { isEmailProvider } from "@/ee/messaging/provider-icon";

export interface StartChatModalData {
  provider: MessagingProvider | null;
  recipientIdentifier: string;
  recipientDisplayName: string | null;
  body: string;
  subject: string;
  cc: string[];
  bcc: string[];
  selectedAccountId: string;
}

export class StartChatModalStore extends BaseModalStore<StartChatModalData> {
  showCcBcc = false;

  constructor(rootStore: RootStore) {
    super(rootStore, {
      provider: null,
      recipientIdentifier: "",
      recipientDisplayName: null,
      body: "",
      subject: "",
      cc: [],
      bcc: [],
      selectedAccountId: "",
    });

    makeObservable(this, {
      showCcBcc: observable,
      isEmail: computed,
      accountsForProvider: computed,
      toggleCcBcc: action,
      openFor: action,
      onSubmit: action,
    });
  }

  toggleCcBcc = () => {
    this.showCcBcc = !this.showCcBcc;
  };

  get isEmail(): boolean {
    return this.form.provider ? isEmailProvider(this.form.provider) : false;
  }

  get accountsForProvider(): ConnectedAccountDto[] {
    const provider = this.form.provider;
    if (!provider) return [];
    return this.rootStore.connectedAccountsStore.usableSendersFor(provider);
  }

  openFor = async (init: {
    provider: MessagingProvider;
    recipientIdentifier: string;
    recipientDisplayName: string | null;
  }) => {
    await this.rootStore.connectedAccountsStore.ensureLoaded();
    const [first] = this.rootStore.connectedAccountsStore.usableSendersFor(init.provider);
    this.showCcBcc = false;
    this.openWith({
      provider: init.provider,
      recipientIdentifier: init.recipientIdentifier,
      recipientDisplayName: init.recipientDisplayName,
      selectedAccountId: first?.id ?? "",
      body: "",
      subject: "",
      cc: [],
      bcc: [],
    });
  };

  onSubmit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    if (!this.form.provider) return;
    this.setIsLoading(true);
    try {
      const result = this.isEmail
        ? await sendEmailAction({
            connectedAccountId: this.form.selectedAccountId,
            to: [
              {
                identifier: this.form.recipientIdentifier,
                display_name: this.form.recipientDisplayName ?? undefined,
              },
            ],
            cc: this.form.cc.length ? this.form.cc : undefined,
            bcc: this.form.bcc.length ? this.form.bcc : undefined,
            subject: this.form.subject.trim(),
            body: this.form.body,
          })
        : await startChatAction({
            connectedAccountId: this.form.selectedAccountId,
            attendeeIdentifiers: [this.form.recipientIdentifier],
            text: this.form.body,
            subject: this.form.subject.trim() || undefined,
          });
      if (result.ok) {
        this.toastSuccess("EntityChannels.startChat.sentToast");
        this.close();
      } else this.setError(result.error);
    } finally {
      this.setIsLoading(false);
    }
  };
}
