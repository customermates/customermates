import type { RootStore } from "@/core/stores/root.store";

import { toast } from "sonner";

import { dispatchTriggerFailureAction, triggerServerErrorAction } from "./actions";

export class ErrorTestStore {
  constructor(public readonly rootStore: RootStore) {}

  triggerUnexpectedClientError = () => {
    throw new Error("Test client-side error - should trigger UnexpectedErrorToaster + Sentry");
  };

  triggerUnexpectedServerError = async () => {
    await this.rootStore.loadingOverlayStore.withLoading(async () => {
      await triggerServerErrorAction();
    });
  };

  triggerBackgroundFailure = async () => {
    await this.rootStore.loadingOverlayStore.withLoading(async () => {
      const { runId } = await dispatchTriggerFailureAction();
      toast.success(this.rootStore.localeStore.getTranslation("ErrorTestPage.toast.triggerQueued", { runId }));
    });
  };
}
