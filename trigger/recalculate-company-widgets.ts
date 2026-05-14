import { task } from "@trigger.dev/sdk/v3";

import { getRecalculateCompanyWidgetsInteractor } from "@/core/app-di";
import { type RecalculateCompanyWidgetsPayload } from "@/features/widget/recalculate-company-widgets.interactor";

export const recalculateCompanyWidgets = task({
  id: "recalculate-company-widgets",
  maxDuration: 60,
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 1_000,
    maxTimeoutInMs: 30_000,
    factor: 2,
  },
  run: async (payload: RecalculateCompanyWidgetsPayload) => {
    return await getRecalculateCompanyWidgetsInteractor().invoke(payload);
  },
});
