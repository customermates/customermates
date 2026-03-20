import { NextResponse } from "next/server";

import { di } from "@/core/dependency-injection/container";
import { CleanupInactiveUsersResourcesInteractor } from "@/ee/lifecycle/cleanup-inactive-users-resources.interactor";
import { CleanupNonProCompaniesResourcesInteractor } from "@/ee/lifecycle/cleanup-non-pro-companies-resources.interactor";
import { DeactivateTrialUsersAndSendNoticeInteractor } from "@/ee/lifecycle/deactivate-trial-users-and-send-notice.interactor";
import { DeactivateUsersAfterSubscriptionGracePeriodInteractor } from "@/ee/lifecycle/deactivate-users-after-subscription-grace-period.interactor";
import { SendTrialExtensionOfferInteractor } from "@/ee/lifecycle/send-trial-extension-offer.interactor";
import { SendTrialInactivationReminderInteractor } from "@/ee/lifecycle/send-trial-inactivation-reminder.interactor";
import { SendWelcomeAndDemoInteractor } from "@/ee/lifecycle/send-welcome-and-demo.interactor";
import { StopInactiveUsersMachinesInteractor } from "@/ee/lifecycle/stop-inactive-users-machines.interactor";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await Promise.all([
    di.get(SendWelcomeAndDemoInteractor).invoke(),
    di.get(SendTrialExtensionOfferInteractor).invoke(),
    di.get(SendTrialInactivationReminderInteractor).invoke(),
    di.get(DeactivateTrialUsersAndSendNoticeInteractor).invoke(),
    di.get(DeactivateUsersAfterSubscriptionGracePeriodInteractor).invoke(),
    di.get(CleanupInactiveUsersResourcesInteractor).invoke(),
    di.get(CleanupNonProCompaniesResourcesInteractor).invoke(),
    di.get(StopInactiveUsersMachinesInteractor).invoke(),
  ]);

  return new NextResponse("ok");
}
