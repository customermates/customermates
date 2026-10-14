import type { FormEvent } from "react";
import type { RootStore } from "@/core/stores/root.store";
import type { CreateApiKeyData } from "@/features/api-key/create-api-key.interactor";
import type { ApiKey } from "@/features/api-key/get-api-keys.interactor";

import { action, makeObservable, observable, runInAction, toJS } from "mobx";
import { Resource } from "@/generated/prisma";

import { createApiKeyAction } from "../actions";

import { AiConnectionStore } from "@/components/ai-connection/ai-connection.store";
import { BaseModalStore } from "@/core/base/base-modal.store";
import { getApiKeyExpirationSeconds } from "@/features/api-key/api-key-expiration";

type ApiKeyModalMode = "create" | "view";
type ApiKeyCreationPath = "wizard" | "plain";

export class ApiKeyModalStore extends BaseModalStore<CreateApiKeyData> {
  public createdKey: string | null = null;
  public creationPath: ApiKeyCreationPath = "wizard";
  public mode: ApiKeyModalMode = "create";
  public viewingKey: ApiKey | null = null;
  public expiresAt: Date | null = null;
  public readonly aiConnectionStore: AiConnectionStore;

  constructor(rootStore: RootStore) {
    super(rootStore, { name: "", expiresIn: undefined }, Resource.api);
    this.aiConnectionStore = new AiConnectionStore(rootStore);

    makeObservable(this, {
      createdKey: observable,
      creationPath: observable,
      mode: observable,
      viewingKey: observable,
      expiresAt: observable,

      add: action,
      backToOptions: action,
      choosePlain: action,
      view: action,
      setExpiresAt: action,
      onSubmit: action,
    });
  }

  add = () => {
    this.createdKey = null;
    this.creationPath = "wizard";
    this.mode = "create";
    this.viewingKey = null;
    this.expiresAt = null;
    this.aiConnectionStore.reset();
    this.openWith({ name: "", expiresIn: undefined });
  };

  choosePlain = () => {
    if (this.aiConnectionStore.isCreating) return;
    this.aiConnectionStore.reset();
    this.creationPath = "plain";
  };

  refreshAfterQuickConnection = async () => {
    await this.rootStore.apiKeysStore.refresh();
  };

  protected override prepareToClose(): boolean {
    if (this.isLoading || this.aiConnectionStore.isCreating) return false;
    this.aiConnectionStore.reset();
    return true;
  }

  backToOptions = () => {
    if (this.isLoading || this.aiConnectionStore.isCreating) return;

    this.creationPath = "wizard";
    this.createdKey = null;
    this.expiresAt = null;
    this.aiConnectionStore.reset();
    this.onInitOrRefresh({ name: "", expiresIn: undefined });
  };

  setExpiresAt = (date: Date | null) => {
    this.expiresAt = date;
    this.onChange("expiresIn", getApiKeyExpirationSeconds(date));
  };

  view = (key: ApiKey) => {
    this.mode = "view";
    this.viewingKey = key;
    this.createdKey = null;
    this.aiConnectionStore.reset();
    this.open();
  };

  onSubmit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    this.setIsLoading(true);

    try {
      this.onChange("expiresIn", getApiKeyExpirationSeconds(this.expiresAt));
      const res = await createApiKeyAction(toJS(this.form));

      if (res.ok) {
        runInAction(() => {
          this.createdKey = res.data.key;
          this.form.name = "";
          this.form.expiresIn = undefined;
          this.expiresAt = null;
        });
        await this.rootStore.apiKeysStore.refresh();
      } else this.setError(res.error);
    } finally {
      this.setIsLoading(false);
    }
  };
}
