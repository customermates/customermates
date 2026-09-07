import type { FormEvent } from "react";
import type { RootStore } from "@/core/stores/root.store";
import type { UpsertWebhookData } from "@/features/webhook/upsert-webhook.interactor";

import { action, makeObservable, observable, toJS } from "mobx";
import { Resource } from "@/generated/prisma";

import { deleteWebhookAction, upsertWebhookAction } from "../../actions";

import { BaseModalStore } from "@/core/base/base-modal.store";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { parseWebhookHeaderLines } from "@/features/webhook/webhook-headers";

export type WebhookFormData = Omit<UpsertWebhookData, "headers"> & { headers?: string };

export class WebhookModalStore extends BaseModalStore<WebhookFormData> {
  showSecret = false;

  constructor(rootStore: RootStore) {
    super(
      rootStore,
      {
        url: "",
        description: undefined,
        events: [],
        secret: undefined,
        headers: "",
        bodyTemplate: undefined,
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

  delete = async (): Promise<boolean> => {
    if (!this.form.id) return false;

    this.setIsLoading(true);

    try {
      const res = await deleteWebhookAction({ id: this.form.id });
      if (!res.ok) {
        toastZodErrorTree(res.error);
        return false;
      }

      await this.rootStore.webhooksStore.removeItem(res.data);
      this.close();
      return true;
    } finally {
      this.setIsLoading(false);
    }
  };

  onSubmit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    this.setIsLoading(true);

    try {
      const { headers, ...form } = toJS(this.form);
      const parsed = parseWebhookHeaderLines(headers ?? "");
      const res = await upsertWebhookAction({
        ...form,
        headers: Object.keys(parsed).length > 0 ? parsed : null,
      });

      if (res.ok) {
        await this.rootStore.webhooksStore.upsertItem(res.data);
        this.close();
      } else this.setError(res.error);
    } finally {
      this.setIsLoading(false);
    }
  };
}
