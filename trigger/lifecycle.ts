import { schedules } from "@trigger.dev/sdk/v3";

import {
  getDeactivateTrialUsersAndSendNoticeInteractor,
  getDeactivateUsersAfterSubscriptionGracePeriodInteractor,
  getSendTrialExtensionOfferInteractor,
  getSendTrialInactivationReminderInteractor,
  getSendWelcomeAndDemoInteractor,
} from "./worker-di";
import { env } from "@/env";

export const lifecycleDaily = schedules.task({
  id: "lifecycle-daily",
  cron: "0 9 * * *",
  maxDuration: 300,
  run: async () => {
    if (env.DEMO_MODE) return { skipped: "demo-mode" as const };

    await Promise.all([
      getSendWelcomeAndDemoInteractor().invoke(),
      getSendTrialExtensionOfferInteractor().invoke(),
      getSendTrialInactivationReminderInteractor().invoke(),
      getDeactivateTrialUsersAndSendNoticeInteractor().invoke(),
      getDeactivateUsersAfterSubscriptionGracePeriodInteractor().invoke(),
    ]);

    return { ok: true };
  },
});
