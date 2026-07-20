import type { SubscriptionPlan, SubscriptionStatus } from "@/generated/prisma";

export type PlanChipVariant = "success" | "warning" | "destructive";

export type PlanChipModel = {
  label: string;
  variant: PlanChipVariant;
  href: string;
};

export const SUBSCRIPTION_PAGE_HREF = "/company/subscription";

const URGENT_TRIAL_DAYS = 3;

const LOCALIZED_PLANS = ["starter", "pro", "business", "enterprise"] as const satisfies readonly SubscriptionPlan[];
const localizedPlans = new Set<string>(LOCALIZED_PLANS);

type Translate = (key: string, values?: Record<string, string | number>) => string;

function statusVariant(status: SubscriptionStatus, trialDaysLeft: number | null): PlanChipVariant {
  if (status === "active") return "success";
  if (status === "trial") return trialDaysLeft != null && trialDaysLeft <= URGENT_TRIAL_DAYS ? "warning" : "success";
  return "destructive";
}

function statusText(status: SubscriptionStatus, trialDaysLeft: number | null, t: Translate): string {
  if (status === "trial") {
    return trialDaysLeft != null
      ? t("Subscription.status.trialDaysLeft", { days: trialDaysLeft })
      : t("Subscription.status.trial");
  }

  return t(`Subscription.status.${status}`);
}

export function resolvePlanChip(
  params: { status: SubscriptionStatus | null; plan: SubscriptionPlan | null; trialDaysLeft: number | null },
  t: Translate,
): PlanChipModel | null {
  const { status, plan, trialDaysLeft } = params;

  if (!status) return null;

  const variant = statusVariant(status, trialDaysLeft);
  const text = statusText(status, trialDaysLeft, t);

  if (!plan || !localizedPlans.has(plan)) return { label: text, variant, href: SUBSCRIPTION_PAGE_HREF };

  const planName = t(`Subscription.planNames.${plan}`);

  const label = status === "active" ? planName : t("Subscription.planStatusLabel", { plan: planName, status: text });

  return { label, variant, href: SUBSCRIPTION_PAGE_HREF };
}
