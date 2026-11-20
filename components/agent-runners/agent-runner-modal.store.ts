import type { FormEvent } from "react";
import type { RootStore } from "@/core/stores/root.store";
import type { CreateAgentRunnerData } from "@/features/agent-runners/agent-runner.schema";

import { action, makeObservable, observable, runInAction, toJS } from "mobx";
import { Resource } from "@/generated/prisma";

import { BaseModalStore } from "@/core/base/base-modal.store";

import { createAgentRunnerAction } from "./actions";

export class AgentRunnerModalStore extends BaseModalStore<CreateAgentRunnerData> {
  public createdToken: string | null = null;
  public serverUrl: string | null = null;

  constructor(rootStore: RootStore) {
    super(rootStore, { name: "" }, Resource.api);

    makeObservable(this, {
      createdToken: observable,
      serverUrl: observable,

      add: action,
      onSubmit: action,
    });
  }

  add = () => {
    this.createdToken = null;
    this.serverUrl = null;
    this.openWith({ name: "" });
  };

  onSubmit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    this.setIsLoading(true);

    try {
      const result = await createAgentRunnerAction(toJS(this.form));

      if (result.ok) {
        runInAction(() => {
          this.createdToken = result.data.token;
          this.serverUrl = result.data.url;
          this.form.name = "";
        });
        await this.rootStore.agentRunnersStore.refresh();
      } else this.setError(result.error);
    } finally {
      this.setIsLoading(false);
    }
  };
}
