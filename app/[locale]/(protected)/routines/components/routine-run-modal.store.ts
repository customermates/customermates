import type { RootStore } from "@/core/stores/root.store";
import type { RoutineRunDto } from "@/ee/routines/routine.schema";

import { action, computed, makeObservable, observable, runInAction } from "mobx";
import { Resource } from "@/generated/prisma";

import { BaseModalStore } from "@/core/base/base-modal.store";

export type RoutineRunModalForm = { runId?: string };

export class RoutineRunModalStore extends BaseModalStore<RoutineRunModalForm> {
  run: RoutineRunDto | null = null;
  isConversationLoading = false;

  constructor(rootStore: RootStore) {
    super(rootStore, {}, Resource.api);

    makeObservable(this, {
      run: observable,
      isConversationLoading: observable,

      canFollowUp: computed,

      openRun: action,
      sendFollowUp: action,
    });
  }

  get canFollowUp(): boolean {
    return Boolean(this.run?.conversationId) && !this.isConversationLoading;
  }

  openRun = (run: RoutineRunDto) => {
    this.run = run;
    this.openWith({ runId: run.id });

    if (!run.conversationId) return;

    this.isConversationLoading = true;
    void this.rootStore.routineRunChatStore
      .selectConversation(run.conversationId)
      .finally(() => runInAction(() => (this.isConversationLoading = false)));
  };

  sendFollowUp = () => {
    const chat = this.rootStore.routineRunChatStore;
    const text = chat.composerDraft.trim();
    if (!text || chat.isWorking) return;

    chat.setComposerDraft("");
    void chat.sendMessage(text);
  };
}
