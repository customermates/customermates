import type { RootStore } from "@/core/stores/root.store";
import type { SendFeedbackData } from "@/features/feedback/send-feedback.schema";
import type { FormEvent } from "react";

import { addToast } from "@heroui/toast";

import { sendFeedbackAction } from "../../actions";

import { FeedbackType } from "@/features/feedback/send-feedback.schema";
import { BaseModalStore } from "@/core/base/base-modal.store";

export class FeedbackModalStore extends BaseModalStore<SendFeedbackData> {
  constructor(public readonly rootStore: RootStore) {
    super(rootStore, {
      feedback: "",
      type: FeedbackType.general,
    });
  }

  onSubmit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();

    this.setIsLoading(true);

    try {
      const res = await sendFeedbackAction({
        feedback: this.form.feedback,
        type: this.form.type,
      });

      if (res.ok) {
        this.close();
        this.onInitOrRefresh({ feedback: "", type: this.form.type });
        addToast({
          description: this.rootStore.localeStore.getTranslation("feedback.success"),
          color: "success",
        });
      } else this.setError(res.error);
    } finally {
      this.setIsLoading(false);
    }
  };
}
