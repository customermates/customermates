import type { RootStore } from "@/core/stores/root.store";
import type { FormEvent } from "react";

import { BaseModalStore } from "@/core/base/base-modal.store";

export interface DeleteConfirmationData {
  title: string;
  message: string;
  entityName?: string;
  onConfirm: () => Promise<boolean>;
}

export class DeleteConfirmationModalStore extends BaseModalStore<DeleteConfirmationData> {
  constructor(rootStore: RootStore) {
    super(rootStore, {
      title: "",
      message: "",
      onConfirm: () => Promise.resolve(false),
    });
  }

  onSubmit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();

    if (!this.form.onConfirm) return;

    this.setIsLoading(true);
    try {
      const confirmed = await this.form.onConfirm();
      if (!confirmed) return;

      this.toastSuccess("Common.notifications.deleted");
      this.close();
    } finally {
      this.setIsLoading(false);
    }
  };
}
