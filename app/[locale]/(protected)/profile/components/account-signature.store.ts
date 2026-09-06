import type { FormEvent } from "react";
import type { RootStore } from "@/core/stores/root.store";
import type { ConnectedAccountDto } from "@/ee/messaging/messaging.schema";
import type { SetConnectedAccountSignatureData } from "@/ee/messaging/connect/set-connected-account-signature.interactor";

import { action, makeObservable, observable, override as mobxOverride, toJS } from "mobx";
import { cloneDeep } from "lodash";

import { BaseFormStore } from "@/core/base/base-form.store";
import { defaultEmailSettings } from "@/ee/messaging/email-settings";
import { Action, Resource } from "@/generated/prisma";

import { setConnectedAccountSignatureAction } from "../connected-accounts/actions";

type AccountSignatureForm = Omit<SetConnectedAccountSignatureData, "id">;

export class AccountSignatureStore extends BaseFormStore<AccountSignatureForm> {
  accountId = "";
  isOwner = false;
  private generation = 0;

  constructor(rootStore: RootStore) {
    super(rootStore, { signature: "", settings: defaultEmailSettings() }, Resource.inboxMessages);
    this.setWithUnsavedChangesGuard(false);

    makeObservable(this, {
      accountId: observable,
      isOwner: observable,
      isReadOnly: mobxOverride,
      hydrate: action,
      resetSession: action,
      onSubmit: action,
    });
  }

  override get isReadOnly(): boolean {
    void this.rootStore.userStore.user;
    return !this.isOwner || !this.rootStore.userStore.can(Resource.inboxMessages, Action.update);
  }

  hydrate = (account: ConnectedAccountDto): void => {
    this.generation += 1;
    this.accountId = account.id;
    this.isOwner = account.isOwner;
    this.onInitOrRefresh({
      signature: account.signature ?? "",
      settings: cloneDeep(account.emailSettings),
    });
  };

  resetSession = (): void => {
    this.generation += 1;
    this.accountId = "";
    this.resetForm();
    this.setError(undefined);
    this.setIsLoading(false);
  };

  onSubmit = async (event?: FormEvent<HTMLFormElement>): Promise<void> => {
    event?.preventDefault();
    if (this.isDisabled || !this.accountId || !this.hasUnsavedChanges) return;

    const generation = this.generation;
    const accountId = this.accountId;
    const form = toJS(this.form);
    this.setIsLoading(true);
    try {
      const result = await setConnectedAccountSignatureAction(accountId, form.signature, form.settings);
      if (!result.ok) {
        if (generation === this.generation) this.setError(result.error);
        return;
      }

      await this.rootStore.connectedAccountsStore.upsertItem(result.data);
      if (generation !== this.generation) return;

      this.hydrate(result.data);
      const modal = this.rootStore.connectedAccountModalStore;
      if (modal.form.id === accountId) modal.onInitOrRefresh(result.data);
      this.toastSuccess("ConnectedAccountsCard.emailSaved");
    } finally {
      if (generation === this.generation) this.setIsLoading(false);
    }
  };
}
