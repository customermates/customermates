import type { RootStore } from "@/core/stores/root.store";
import type { FormEvent } from "react";

import { BaseModalStore } from "@/core/base/base-modal.store";

export interface DeleteConfirmationData {
  title: string;
  message: string;
  entityName?: string;
  onConfirm: () => Promise<void> | void;
}

export class XDeleteConfirmationModalStore extends BaseModalStore<DeleteConfirmationData> {
  constructor(rootStore: RootStore) {
    super(rootStore, {
      title: "",
      message: "",
      onConfirm: () => {},
    });
  }

  onSubmit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();

    if (!this.form.onConfirm) return;

    this.setIsLoading(true);
    try {
      await this.form.onConfirm();
      this.close();
    } finally {
      this.setIsLoading(false);
    }
  };
}
