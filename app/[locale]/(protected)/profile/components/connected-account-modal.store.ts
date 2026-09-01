import type { RootStore } from "@/core/stores/root.store";

import { ConnectedAccountStatus, MessagingProvider, Resource } from "@/generated/prisma";

import { BaseModalStore } from "@/core/base/base-modal.store";

import type { ConnectedAccountDto } from "@/ee/messaging/messaging.schema";

export class ConnectedAccountModalStore extends BaseModalStore<ConnectedAccountDto> {
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
        signatureHtml: null,
      },
      Resource.inboxMessages,
    );
  }

  toggleVisibility = async (shared: boolean): Promise<void> => {
    const updated = await this.rootStore.connectedAccountsStore.setVisibility(this.form.id, shared);
    if (updated) this.onInitOrRefresh(updated);
  };

  saveSignature = async (signature: string): Promise<void> => {
    const updated = await this.rootStore.connectedAccountsStore.setSignature(this.form.id, signature);
    if (updated) this.onInitOrRefresh(updated);
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
}
