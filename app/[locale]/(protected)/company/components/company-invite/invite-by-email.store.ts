import type { FormEvent } from "react";
import type { RootStore } from "@/core/stores/root.store";
import type { InviteUsersByEmailData } from "@/features/company/invite-users-by-email.interactor";

import { action, makeObservable, toJS } from "mobx";
import { toast } from "sonner";
import { Resource } from "@/generated/prisma";

import { inviteUsersByEmailAction } from "../../actions";

import { BaseFormStore } from "@/core/base/base-form.store";

export const MAX_INVITE_EMAILS = 20;

export class InviteByEmailStore extends BaseFormStore<InviteUsersByEmailData> {
  constructor(public readonly rootStore: RootStore) {
    super(rootStore, { emails: [] }, Resource.users);

    makeObservable(this, {
      onSubmit: action,
    });
  }

  onSubmit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    if (this.form.emails.length === 0) return;

    this.setIsLoading(true);

    try {
      const res = await inviteUsersByEmailAction(toJS(this.form));

      if (res.ok) {
        this.onInitOrRefresh({ emails: [] });
        toast.success(
          this.rootStore.localeStore.getTranslation("OnboardingWizard.invite.sentSuccess", {
            count: res.data.sent,
          }),
        );
      } else this.setError(res.error);
    } finally {
      this.setIsLoading(false);
    }
  };
}
