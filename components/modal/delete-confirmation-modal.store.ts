import type { RootStore } from "@/core/stores/root.store";
import type { FormEvent } from "react";

import { BaseModalStore } from "@/core/base/base-modal.store";

export interface DeleteConfirmationData {
  title: string;
  message: string;
  entityName?: string;
  confirmLabel?: string;
  confirmVariant?: "default" | "destructive";
  details?: string[];
  blockers?: string[];
  confirmationText?: string;
  successKey?: string;
  focusAfterConfirm?: () => boolean;
  onConfirm: () => Promise<boolean>;
}

export class DeleteConfirmationModalStore extends BaseModalStore<DeleteConfirmationData> {
  private sessionGeneration = 0;
  private confirmedFocusReturn: { generation: number; form: DeleteConfirmationData; focus: () => boolean } | null =
    null;
  constructor(rootStore: RootStore) {
    super(rootStore, {
      title: "",
      message: "",
      onConfirm: () => Promise.resolve(false),
    });
  }

  protected override prepareToClose(): boolean {
    this.sessionGeneration += 1;
    this.confirmedFocusReturn = null;
    return true;
  }

  restoreConfirmedFocus = () => {
    const handoff = this.confirmedFocusReturn;
    this.confirmedFocusReturn = null;
    if (!handoff || this.isOpen || handoff.generation !== this.sessionGeneration || handoff.form !== this.form)
      return false;
    return handoff.focus();
  };

  onSubmit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();

    if (!this.isOpen || this.isLoading || !this.form.onConfirm) return;
    const session = this.sessionGeneration;
    const form = this.form;
    const isCurrent = () => this.isOpen && session === this.sessionGeneration && form === this.form;

    this.setIsLoading(true);
    try {
      const confirmed = await form.onConfirm();
      if (!confirmed || !isCurrent()) return;

      this.toastSuccess(form.successKey ?? "Common.notifications.deleted");
      this.close();
      if (form.focusAfterConfirm)
        this.confirmedFocusReturn = { generation: this.sessionGeneration, form, focus: form.focusAfterConfirm };
    } finally {
      if (isCurrent()) this.setIsLoading(false);
    }
  };
}
