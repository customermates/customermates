import { BaseStore } from "@/core/base/base.store";

import { triggerServerErrorAction, triggerWorkflowErrorAction } from "./actions";

export class ErrorTestStore extends BaseStore {
  triggerUnexpectedClientError = () => {
    throw new Error("Test client-side error - should trigger UnexpectedErrorToaster + Sentry");
  };

  triggerUnexpectedServerError = async () => {
    await this.rootStore.loadingOverlayStore.withLoading(async () => {
      await triggerServerErrorAction();
    });
  };

  triggerUnexpectedWorkflowError = async () => {
    await this.rootStore.loadingOverlayStore.withLoading(async () => {
      await triggerWorkflowErrorAction();
    });
  };
}
