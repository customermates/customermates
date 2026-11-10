import type { RootStore } from "@/core/stores/root.store";

import { makeObservable, action, computed, observable, runInAction } from "mobx";
import { Resource } from "@/generated/prisma";

import { getOrCreateInviteTokenAction } from "../../actions";
import { getPlanUsageAction } from "@/app/components/upsell/actions";

import { BaseModalStore } from "@/core/base/base-modal.store";
import { actionData } from "@/core/utils/action-data";

export class CompanyInviteModalStore extends BaseModalStore<{
  inviteLink: string;
  expiresAt: Date | null;
}> {
  memberLimit: { used: number; limit: number } | null = null;

  get teamsNeedPlan(): boolean {
    return this.memberLimit !== null && this.memberLimit.used >= this.memberLimit.limit;
  }

  constructor(rootStore: RootStore) {
    super(
      rootStore,
      {
        inviteLink: "",
        expiresAt: null,
      },
      Resource.users,
    );

    makeObservable(this, {
      memberLimit: observable,
      teamsNeedPlan: computed,
      generateInviteLink: action,
    });
  }

  generateInviteLink = async () => {
    this.setIsLoading(true);

    try {
      const usage = await actionData(getPlanUsageAction());
      runInAction(() => {
        this.memberLimit = usage.limits ? { used: usage.usage.members, limit: usage.limits.maxMembers } : null;
      });
      if (this.teamsNeedPlan) return;
      const res = await actionData(getOrCreateInviteTokenAction());
      this.onInitOrRefresh({
        inviteLink: `${window.location.origin}/invitation/${res.token}`,
        expiresAt: new Date(res.expiresAt),
      });
    } finally {
      this.setIsLoading(false);
    }
  };
}
