import type { FormEvent } from "react";
import type { RootStore } from "@/core/stores/root.store";
import type { SetAgentEnvironmentVariableData } from "@/ee/agent/set-agent-environment-variable.interactor";

import { addToast } from "@heroui/toast";
import { action, makeObservable } from "mobx";

import { setAgentEnvironmentVariableAction } from "@/app/[locale]/(protected)/ai-agent/actions";
import { BaseModalStore } from "@/core/base/base-modal.store";

export class AiAgentEnvironmentVariableModalStore extends BaseModalStore<SetAgentEnvironmentVariableData> {
  constructor(public readonly rootStore: RootStore) {
    super(rootStore, { key: "", value: "" });

    makeObservable(this, {
      onSubmit: action,
    });
  }

  onSubmit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    this.setIsLoading(true);
    try {
      const result = await setAgentEnvironmentVariableAction({
        key: this.form.key.trim(),
        value: this.form.value,
      });

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
