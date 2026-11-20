import type { FormEvent } from "react";
import type { RootStore } from "@/core/stores/root.store";
import type { AgentProviderId } from "@/ee/agent-keys/agent-provider-models";
import type { ManageAction } from "@/features/role/resource-access";

import { action, makeObservable } from "mobx";

import { Action, Resource } from "@/generated/prisma";

import { BaseModalStore } from "@/core/base/base-modal.store";
import { AGENT_PROVIDER_DEFAULT_MODEL } from "@/ee/agent-keys/agent-provider-models";

import { saveAgentProviderKeyAction } from "./agent-key-actions";

export type AgentKeyForm = {
  provider: AgentProviderId;
  label: string;
  apiKey: string;
  defaultModel: string;
};

const INITIAL_PROVIDER: AgentProviderId = "anthropic";

function emptyForm(provider: AgentProviderId = INITIAL_PROVIDER): AgentKeyForm {
  return { provider, label: "", apiKey: "", defaultModel: AGENT_PROVIDER_DEFAULT_MODEL[provider] };
}

export class AgentKeyModalStore extends BaseModalStore<AgentKeyForm> {
  constructor(rootStore: RootStore) {
    super(rootStore, emptyForm(), Resource.company);

    makeObservable(this, {
      add: action,
      selectProvider: action,
      onSubmit: action,
    });
  }

  add = () => {
    this.openWith(emptyForm());
  };

  selectProvider = (provider: AgentProviderId) => {
    this.onChange("provider", provider);
    this.onChange("defaultModel", AGENT_PROVIDER_DEFAULT_MODEL[provider]);
  };

  protected override get manageAction(): ManageAction {
    return Action.update;
  }

  onSubmit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    this.setIsLoading(true);

    try {
      const { provider, label, apiKey, defaultModel } = this.form;
      const result = await saveAgentProviderKeyAction({ provider, label, apiKey, defaultModel });
      if (!result.ok) {
        this.setError(result.error);
        return;
      }
      this.onInitOrRefresh(emptyForm(provider));
      await this.rootStore.agentKeysStore.refresh();
      this.close();
    } finally {
      this.setIsLoading(false);
    }
  };
}
