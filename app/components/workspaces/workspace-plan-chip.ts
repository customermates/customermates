import type { WorkspaceSummary } from "@/features/workspace/workspace.schema";

import { SubscriptionStatus } from "@/generated/prisma";

import { resolvePlanChip, trialDaysLeft } from "@/app/components/navigation/plan-subtitle";

type Translate = Parameters<typeof resolvePlanChip>[1];

export function workspacePlanChip(
  subscription: WorkspaceSummary["subscription"],
  t: Translate,
  now = Date.now(),
): ReturnType<typeof resolvePlanChip> {
  if (!subscription) return null;
  if (subscription.status === SubscriptionStatus.expired && subscription.trialEndDate === null)
    return { label: t("Workspaces.noPlan"), variant: "warning" };

  return resolvePlanChip(
    {
      status: subscription.status,
      plan: subscription.plan,
      trialDaysLeft: trialDaysLeft(subscription.trialEndDate, now),
    },
    t,
  );
}
