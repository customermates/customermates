import type { FormEvent } from "react";
import type { RootStore } from "@/core/stores/root.store";
import type { UpsertAgentKeysData } from "@/ee/agent/provision-agent.interactor";

import { action, makeObservable, toJS } from "mobx";
import { addToast } from "@heroui/toast";

import { upsertAgentKeysAction } from "@/app/[locale]/(protected)/ai-agent/actions";
import { BaseModalStore } from "@/core/base/base-modal.store";

export class AiAgentProvisionModalStore extends BaseModalStore<UpsertAgentKeysData> {
  constructor(public readonly rootStore: RootStore) {
    super(rootStore, { openaiApiKey: "", anthropicApiKey: "" });

    makeObservable(this, {
      onSubmit: action,
    });
  }

  onSubmit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    this.setIsLoading(true);
    try {
      const result = await upsertAgentKeysAction(toJS(this.form));

      if (!result.ok) {
        this.setError(result.error);
        return;
      }

      addToast({
        color: "success",
        description: this.rootStore.localeStore.getTranslation("AiAgent.provisionPending"),
      });
      this.close();
      void this.rootStore.appSidebarStore.refreshAgentStatus();
    } finally {
      this.setIsLoading(false);
    }
  };
}
