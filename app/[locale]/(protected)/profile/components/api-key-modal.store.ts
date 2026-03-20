import type { FormEvent } from "react";
import type { RootStore } from "@/core/stores/root.store";
import type { CreateApiKeyData } from "@/features/api-key/create-api-key.interactor";

import { action, makeObservable, observable, runInAction, toJS } from "mobx";
import { Resource } from "@/generated/prisma";

import { createApiKeyAction } from "../actions";

import { BaseModalStore } from "@/core/base/base-modal.store";

export class ApiKeyModalStore extends BaseModalStore<CreateApiKeyData> {
  public createdKey: string | null = null;

  constructor(public readonly rootStore: RootStore) {
    super(rootStore, { name: "", expiresIn: undefined }, Resource.api);

    makeObservable(this, {
      createdKey: observable,

      add: action,
      onSubmit: action,
    });
  }

  add = () => {
    this.createdKey = null;
    this.onInitOrRefresh({ name: "", expiresIn: undefined });
    this.open();
  };

  onSubmit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    this.setIsLoading(true);

    try {
      const res = await createApiKeyAction(toJS(this.form));

      if (res.ok) {
        runInAction(() => {
          this.createdKey = res.data.key;
          this.form.name = "";
          this.form.expiresIn = undefined;
        });
        await this.rootStore.apiKeysStore.refresh();
      } else this.setError(res.error);
    } finally {
      this.setIsLoading(false);
    }
  };
}
