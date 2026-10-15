import type { FormEvent } from "react";
import type { RootStore } from "@/core/stores/root.store";
import type { InviteUsersByEmailData } from "@/features/company/invite-users-by-email.interactor";

import { action, makeObservable, observable, runInAction, toJS } from "mobx";
import { Resource } from "@/generated/prisma";

import { getOrCreateInviteTokenAction, inviteUsersByEmailAction } from "../../actions";

import { BaseFormStore } from "@/core/base/base-form.store";

export const MAX_INVITE_EMAILS = 20;

export class InviteByEmailStore extends BaseFormStore<InviteUsersByEmailData> {
  inviteToken: string | null = null;
  isLoadingToken = true;

  constructor(rootStore: RootStore) {
    super(rootStore, { emails: [] }, Resource.users);

    makeObservable(this, {
      inviteToken: observable,
      isLoadingToken: observable,
      loadInviteToken: action,
      onSubmit: action,
    });
  }

  loadInviteToken = async (): Promise<void> => {
    try {
      const res = await getOrCreateInviteTokenAction();
      runInAction(() => {
        this.inviteToken = res.token;
      });
    } finally {
      runInAction(() => {
        this.isLoadingToken = false;
      });
    }
  };

  onSubmit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    this.setIsLoading(true);

    try {
      const res = await inviteUsersByEmailAction(toJS(this.form));

      if (!res.ok) this.setError(res.error);
      else if (res.data.failed === 0) {
        this.onInitOrRefresh({ emails: [] });
        this.toastSuccess("OnboardingWizard.invite.sentSuccess", { values: { count: res.data.sent } });
      } else {
        this.onInitOrRefresh({ emails: res.data.failedEmails });
        this.toastError(
          res.data.sent === 0 ? "OnboardingWizard.invite.sendFailed" : "OnboardingWizard.invite.sendPartlyFailed",
          {
            values: { sent: res.data.sent, failed: res.data.failed },
            descriptionKey: "OnboardingWizard.invite.sendFailedDescription",
          },
        );
      }
    } finally {
      this.setIsLoading(false);
    }
  };
}
