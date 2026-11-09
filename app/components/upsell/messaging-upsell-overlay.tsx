import type { ReactNode } from "react";

import { getTranslations } from "next-intl/server";

import { LockedFeatureOverlay } from "@/components/shared/locked-feature-overlay";

import { MESSAGING_UPSELL_PLAN, planUpsellHighlights } from "./plan-upsell-highlights";
import { UpsellCta } from "./upsell-cta";
import { UpsellHighlights } from "./upsell-highlights";
import { UpsellInboxPreview } from "./upsell-inbox-preview";
import { UpsellPlanPrice } from "./upsell-plan-price";

type Props = {
  reason: "plan" | "subscription";
  children: ReactNode;
};

export async function MessagingUpsellOverlay({ reason, children }: Props) {
  const t = await getTranslations();
  const plan = MESSAGING_UPSELL_PLAN;

  return (
    <LockedFeatureOverlay
      action={<UpsellCta plan={plan} />}
      description={
        reason === "subscription"
          ? t("ConnectedAccountsCard.paidSubscriptionRequired")
          : t("MessagingUpsell.description")
      }
      eyebrow={<UpsellPlanPrice plan={plan} />}
      highlights={<UpsellHighlights items={planUpsellHighlights(plan, t)} />}
      preview={<UpsellInboxPreview />}
      title={t("MessagingUpsell.title")}
    >
      {children}
    </LockedFeatureOverlay>
  );
}
