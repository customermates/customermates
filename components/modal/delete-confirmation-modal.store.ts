import type { RootStore } from "@/core/stores/root.store";
import type { FormEvent } from "react";

import { BaseModalStore } from "@/core/base/base-modal.store";

export interface DeleteConfirmationData {
  title: string;
  message: string;
  entityName?: string;
  confirmLabel?: string;
  confirmVariant?: "default" | "destructive";
  successKey?: string;
  onConfirm: () => Promise<boolean>;
}

export class DeleteConfirmationModalStore extends BaseModalStore<DeleteConfirmationData> {
  private sessionGeneration = 0;
  constructor(rootStore: RootStore) {
    super(rootStore, {
      title: "",
      message: "",
      onConfirm: () => Promise.resolve(false),
    });
  }

  protected override prepareToClose(): boolean {
    this.sessionGeneration += 1;
    return true;
  }

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
    } finally {
      if (isCurrent()) this.setIsLoading(false);
    }
  };
}
