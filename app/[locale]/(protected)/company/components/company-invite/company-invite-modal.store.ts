import type { RootStore } from "@/core/stores/root.store";

import { makeObservable, action } from "mobx";

import { Resource } from "@/generated/prisma";

import { getOrCreateInviteTokenAction } from "../../actions";

import { BaseModalStore } from "@/core/base/base-modal.store";

export class CompanyInviteModalStore extends BaseModalStore<{
  inviteLink: string;
  expiresAt: Date | null;
  isDisabled: boolean;
}> {
  constructor(public readonly rootStore: RootStore) {
    super(
      rootStore,
      {
        inviteLink: "",
        expiresAt: null,
        isDisabled: false,
      },
      Resource.users,
    );

    makeObservable(this, {
      generateInviteLink: action,
      setIsDisabled: action,
    });
  }

  setIsDisabled = (value: boolean) => {
    this.form.isDisabled = value;
  };

  generateInviteLink = async () => {
    this.setIsLoading(true);

    try {
      const res = await getOrCreateInviteTokenAction();
      this.onInitOrRefresh({
        inviteLink: `${window.location.origin}/invitation/${res.token}`,
        expiresAt: new Date(res.expiresAt),
      });
    } finally {
      this.setIsLoading(false);
    }
  };
}
