import type { ReactNode } from "react";

import { getTranslations } from "next-intl/server";

import { LockedFeatureOverlay } from "@/components/shared/locked-feature-overlay";
import { FREE_PLAN_UPGRADE_PLAN } from "@/core/commercial/plan-catalog";

import { freeUpgradeHighlights } from "./plan-upsell-highlights";
import { UpsellCta } from "./upsell-cta";
import { UpsellHighlights } from "./upsell-highlights";
import { UpsellPlanPrice } from "./upsell-plan-price";
import { UpsellRoutinesPreview } from "./upsell-routines-preview";
import { UpsellWebhooksPreview } from "./upsell-webhooks-preview";

type Props = {
  feature: "routines" | "webhooks";
  children: ReactNode;
};

export async function FreePlanFeatureOverlay({ feature, children }: Props) {
  const t = await getTranslations();
  const plan = FREE_PLAN_UPGRADE_PLAN;
  const planName = t(`Subscription.planNames.${plan}`);

  return (
    <LockedFeatureOverlay
      action={<UpsellCta plan={plan} />}
      description={
        feature === "routines"
          ? t("Upsell.locked.routines.description", { plan: planName })
          : t("Upsell.locked.webhooks.description", { plan: planName })
      }
      eyebrow={<UpsellPlanPrice plan={plan} />}
      highlights={<UpsellHighlights items={freeUpgradeHighlights(plan, t)} />}
      preview={feature === "routines" ? <UpsellRoutinesPreview /> : <UpsellWebhooksPreview />}
      title={
        feature === "routines"
          ? t("Upsell.locked.routines.title", { plan: planName })
          : t("Upsell.locked.webhooks.title", { plan: planName })
      }
    >
      {children}
    </LockedFeatureOverlay>
  );
}
