import type { FormEvent } from "react";
import type { RootStore } from "@/core/stores/root.store";
import type { UpsertWebhookData } from "@/features/webhook/upsert-webhook.interactor";

import { action, makeObservable, observable, toJS } from "mobx";
import { Resource } from "@/generated/prisma";

import { deleteWebhookAction, upsertWebhookAction } from "../../actions";

import { BaseModalStore } from "@/core/base/base-modal.store";

export class WebhookModalStore extends BaseModalStore<UpsertWebhookData> {
  showSecret = false;

  constructor(rootStore: RootStore) {
    super(
      rootStore,
      {
        url: "",
        description: undefined,
        events: [],
        secret: undefined,
        enabled: true,
      },
      Resource.api,
    );

    makeObservable(this, {
      showSecret: observable,

      delete: action,
      onSubmit: action,
      toggleShowSecret: action,
    });
  }

  toggleShowSecret = () => {
    this.showSecret = !this.showSecret;
  };

  delete = async () => {
    if (!this.form.id) return;

    this.setIsLoading(true);

    try {
      const res = await deleteWebhookAction({ id: this.form.id });

      if (res.ok) await this.rootStore.webhooksStore.removeItem(res.data);
      this.close();
    } finally {
      this.setIsLoading(false);
    }
  };

  onSubmit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    this.setIsLoading(true);

    try {
      const res = await upsertWebhookAction(toJS(this.form));

      if (res.ok) {
        await this.rootStore.webhooksStore.upsertItem(res.data);
        this.close();
      } else this.setError(res.error);
    } finally {
      this.setIsLoading(false);
    }
  };
}
