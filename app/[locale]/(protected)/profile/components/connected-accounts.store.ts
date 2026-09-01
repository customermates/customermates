import type { ConnectedAccountDto } from "@/ee/messaging/messaging.schema";
import type { ConnectChannel } from "@/ee/messaging/connect/connect-channels";
import type { RootStore } from "@/core/stores/root.store";
import type { TableColumn } from "@/core/base/base-data-view.store";
import type { GetQueryParams } from "@/core/base/base-get.schema";
import type { MessagingProvider } from "@/generated/prisma";

import { action, computed, makeObservable } from "mobx";

import { accountNeedsAction, isUsableSenderFor } from "@/ee/messaging/provider";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";

import {
  disconnectConnectedAccountAction,
  refreshConnectedAccountsAction,
  resyncConnectedAccountAction,
  setConnectedAccountVisibilityAction,
  setConnectedAccountSignatureAction,
  setSelectedFoldersAction,
  startConnectAccountAction,
  startReconnectAccountAction,
} from "../connected-accounts/actions";

import { BaseDataViewStore } from "@/core/base/base-data-view.store";

const SYNC_POLL_INTERVAL_MS = 2_000;
const SYNC_POLL_MAX_MS = 10 * 60 * 1_000;
const SYNC_POLL_GRACE_MS = 90_000;

export class ConnectedAccountsStore extends BaseDataViewStore<ConnectedAccountDto> {
  private syncPollTimer: ReturnType<typeof setTimeout> | null = null;
  private syncPollDeadline = 0;
  private syncPollGraceDeadline = 0;
  private syncPollFailureNotified = false;
  private syncPollGeneration = 0;
  private syncPollingActive = false;
  private loadPromise: Promise<void> | null = null;

  constructor(rootStore: RootStore) {
    super(rootStore);

    makeObservable(this, {
      hasSyncingAccount: computed,
      needsActionCount: computed,
      disconnect: action,
      resync: action,
      reconnect: action,
      setVisibility: action,
      connectAccount: action,
    });
  }

  get hasSyncingAccount(): boolean {
    return this.items.some((account) => account.syncing);
  }

  get needsActionCount(): number {
    return this.items.filter(accountNeedsAction).length;
  }

  ensureLoaded = (): Promise<void> => {
    if (this.isReady) return Promise.resolve();
    return (this.loadPromise ??= this.refresh().finally(() => (this.loadPromise = null)));
  };

  usableSendersFor = (provider: MessagingProvider): ConnectedAccountDto[] => {
    return this.items.filter((account) => isUsableSenderFor(account, provider));
  };

  startSyncPolling = (): void => {
    this.stopSyncPolling();
    const generation = ++this.syncPollGeneration;
    const now = Date.now();
    this.syncPollingActive = true;
    this.syncPollFailureNotified = false;
    this.syncPollDeadline = now + SYNC_POLL_MAX_MS;
    this.syncPollGraceDeadline = now + SYNC_POLL_GRACE_MS;
    this.scheduleNextSyncPoll(generation);
  };

  stopSyncPolling = (): void => {
    this.syncPollingActive = false;
    this.syncPollGeneration += 1;
    if (!this.syncPollTimer) return;
    clearTimeout(this.syncPollTimer);
    this.syncPollTimer = null;
  };

  private scheduleNextSyncPoll = (generation: number): void => {
    if (!this.ownsSyncPoll(generation)) return;

    const now = Date.now();
    const keepPolling = (this.hasSyncingAccount || now < this.syncPollGraceDeadline) && now < this.syncPollDeadline;

    if (!keepPolling) {
      this.stopSyncPolling();
      return;
    }

    this.syncPollTimer = setTimeout(() => void this.runSyncPoll(generation), SYNC_POLL_INTERVAL_MS);
  };

  private ownsSyncPoll = (generation: number): boolean =>
    this.syncPollingActive && generation === this.syncPollGeneration;

  private runSyncPoll = async (generation: number): Promise<void> => {
    try {
      await this.refreshGuarded(() => this.ownsSyncPoll(generation));
      if (!this.ownsSyncPoll(generation)) return;
      this.syncPollFailureNotified = false;
    } catch {
      if (!this.ownsSyncPoll(generation)) return;
      if (!this.syncPollFailureNotified) {
        this.syncPollFailureNotified = true;
        this.toastError("Common.notifications.unexpectedError");
      }
    } finally {
      this.scheduleNextSyncPoll(generation);
    }
  };

  get columnsDefinition(): TableColumn[] {
    return [];
  }

  disconnect = async (id: string): Promise<boolean> => {
    return this.rootStore.loadingOverlayStore.withLoading(async () => {
      const res = await disconnectConnectedAccountAction(id);
      if (!res.ok) {
        toastZodErrorTree(res.error);
        return false;
      }

      await this.removeItem(id);
      return true;
    });
  };

  resync = async (id: string): Promise<void> => {
    await this.rootStore.loadingOverlayStore.withLoading(async () => {
      const res = await resyncConnectedAccountAction(id);
      if (res.ok) {
        this.toastSuccess("ConnectedAccountsCard.resyncStartedTitle", {
          descriptionKey: "ConnectedAccountsCard.resyncStartedDescription",
        });
        await this.refresh();
        this.startSyncPolling();
      } else {
        this.toastError("ConnectedAccountsCard.resyncFailedTitle", {
          descriptionKey: "ConnectedAccountsCard.resyncFailedDescription",
        });
      }
    });
  };

  reconnect = async (id: string): Promise<void> => {
    await this.rootStore.loadingOverlayStore.withLoading(async () => {
      const res = await startReconnectAccountAction(id);
      if (!res.ok) {
        toastZodErrorTree(res.error);
        return;
      }
      window.location.assign(res.data.url);
    });
  };

  connectAccount = async (channel: ConnectChannel): Promise<void> => {
    await this.rootStore.loadingOverlayStore.withLoading(async () => {
      const res = await startConnectAccountAction(channel);
      if (res.ok) {
        window.location.assign(res.data.url);
        return;
      }

      if (res.code === "upgradeToBusinessForMoreAccounts") {
        this.rootStore.connectUpsellModalStore.openWith({ message: res.error.errors[0] ?? "" });
        return;
      }

      toastZodErrorTree(res.error);
    });
  };

  setSignature = async (id: string, signature: string): Promise<ConnectedAccountDto | null> => {
    const res = await setConnectedAccountSignatureAction(id, signature);

    if (!res.ok) {
      this.toastError("ConnectedAccountsCard.signatureUpdateFailed");
      return null;
    }

    const existing = this.items.find((account) => account.id === id);
    const merged = { ...existing, ...res.data };
    await this.upsertItem(merged);
    this.toastSuccess("ConnectedAccountsCard.signatureSaved");

    return merged;
  };

  setVisibility = async (id: string, shared: boolean): Promise<ConnectedAccountDto | null> => {
    const res = await setConnectedAccountVisibilityAction(id, shared);

    if (!res.ok) {
      this.toastError("ConnectedAccountsCard.visibilityUpdateFailed");
      return null;
    }

    const existing = this.items.find((account) => account.id === id);
    const merged = { ...existing, ...res.data };
    await this.upsertItem(merged);

    this.toastSuccess(shared ? "ConnectedAccountsCard.sharedOnToast" : "ConnectedAccountsCard.sharedOffToast");

    return merged;
  };

  setSelectedFolders = async (id: string, selectedFolderIds: string[]): Promise<ConnectedAccountDto | null> => {
    const existing = this.items.find((account) => account.id === id);
    if (existing) this.upsertItemLocal({ ...existing, selectedFolderIds });

    const res = await setSelectedFoldersAction(id, selectedFolderIds);

    if (!res.ok) {
      if (existing) this.upsertItemLocal(existing);
      this.toastError("ConnectedAccountsCard.foldersUpdateFailed");
      return null;
    }

    const merged = { ...existing, ...res.data };
    await this.upsertItem(merged);

    void this.rootStore.messagingThreadsStore
      .refresh()
      .catch(() => this.toastError("Common.notifications.unexpectedError"));
    this.startSyncPolling();

    return merged;
  };

  protected async refreshAction(_params?: GetQueryParams) {
    const accounts = await refreshConnectedAccountsAction();

    return { items: accounts };
  }
}
