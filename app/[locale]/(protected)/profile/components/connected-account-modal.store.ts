import type { RootStore } from "@/core/stores/root.store";

import { ConnectedAccountStatus, MessagingProvider, Resource } from "@/generated/prisma";

import { BaseModalStore } from "@/core/base/base-modal.store";

import type { ConnectedAccountDto } from "@/ee/messaging/messaging.schema";
import type { EmailSettings } from "@/ee/messaging/email-settings";

import { action, makeObservable, observable, override as mobxOverride } from "mobx";

import { defaultEmailSettings } from "@/ee/messaging/email-settings";

export class ConnectedAccountModalStore extends BaseModalStore<ConnectedAccountDto> {
  public emailSettingsDirty = false;

  constructor(rootStore: RootStore) {
    super(
      rootStore,
      {
        id: "",
        provider: MessagingProvider.mail,
        status: ConnectedAccountStatus.connecting,
        hasMessaging: false,
        hasCalendar: false,
        emailAddress: null,
        displayName: null,
        shared: false,
        syncing: false,
        lastSyncedAt: null,
        createdAt: new Date(),
        owner: { userId: "", firstName: "", lastName: "", avatarUrl: null },
        isOwner: false,
        folders: [],
        selectedFolderIds: [],
        foldersSyncedAt: null,
        linkedinProducts: [],
        signature: null,
        emailSettings: defaultEmailSettings(),
        signatureHtml: null,
      },
      Resource.inboxMessages,
    );

    makeObservable(this, {
      emailSettingsDirty: observable,
      hasUnsavedChanges: mobxOverride,
      setEmailSettingsDirty: action,
    });
  }

  override get hasUnsavedChanges(): boolean {
    return super.hasUnsavedChanges || this.emailSettingsDirty;
  }

  setEmailSettingsDirty = (dirty: boolean): void => {
    this.emailSettingsDirty = dirty;
  };

  toggleVisibility = async (shared: boolean): Promise<void> => {
    const updated = await this.rootStore.connectedAccountsStore.setVisibility(this.form.id, shared);
    if (updated) this.onInitOrRefresh(updated);
  };

  saveSignature = async (signature: string, settings: EmailSettings): Promise<boolean> => {
    const updated = await this.rootStore.connectedAccountsStore.setSignature(this.form.id, signature, settings);
    if (!updated) return false;

    this.onInitOrRefresh(updated);
    return true;
  };

  toggleFolder = async (folderId: string, on: boolean): Promise<void> => {
    const next = new Set(this.form.selectedFolderIds);
    if (on) next.add(folderId);
    else next.delete(folderId);

    const selectedFolderIds = [...next];
    this.onInitOrRefresh({ ...this.form, selectedFolderIds });

    const updated = await this.rootStore.connectedAccountsStore.setSelectedFolders(this.form.id, selectedFolderIds);
    if (updated) this.onInitOrRefresh(updated);
  };

  protected override prepareToClose(): boolean {
    this.emailSettingsDirty = false;
    return true;
  }
}
