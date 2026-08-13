"use client";

import { useTranslations } from "next-intl";
import { Check } from "lucide-react";
import { observer } from "mobx-react-lite";

import { AppChip } from "@/components/chip/app-chip";
import { cn } from "@/core/utils/cn";
import { useRootStore } from "@/core/stores/root-store.provider";
import {
  formatCommercialAmount,
  PLAN_CATALOG,
  PURCHASABLE_PLAN_IDS,
  type AvailableBillingCadence,
  type PurchasablePlanId,
} from "@/core/commercial/plan-catalog";

export type SelectableOffer = {
  plan: PurchasablePlanId;
  cadence: AvailableBillingCadence;
};

type Props = {
  isLoading?: boolean;
  onSelect: (offer: SelectableOffer) => void;
};

export const PlanPicker = observer(function PlanPicker({ isLoading, onSelect }: Props) {
  const t = useTranslations();
  const { intlStore } = useRootStore();
  const locale = intlStore.resolvedFormattingLanguageTag;

  function handleCardClick(offer: SelectableOffer) {
    if (!isLoading) onSelect(offer);
  }

  return (
    <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-3">
      {PURCHASABLE_PLAN_IDS.map((plan) => {
        const featured = plan === "business";
        const offer = PLAN_CATALOG[plan].offers.monthly;
        const selection: SelectableOffer = { plan, cadence: offer.cadence };
        const accountAllowance = PLAN_CATALOG[plan].entitlements.includedAccountsPerUser;
        const features = t.raw(`Subscription.picker.features.${plan}`) as string[];
        const renderedFeatures =
          accountAllowance === 0
            ? features
            : [
                ...features,
                t("Subscription.picker.connectedAccountsPerUser", {
                  accounts: accountAllowance,
                }),
              ];

        return (
          <button
            key={plan}
            className={cn(
              "interactive-surface flex flex-col gap-3 rounded-xl border bg-card p-4 text-left disabled:pointer-events-none disabled:opacity-50",
              featured ? "border-2 border-primary" : "border-border",
            )}
            disabled={isLoading}
            type="button"
            onClick={() => handleCardClick(selection)}
          >
            <span className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold">{t(`Subscription.planNames.${plan}`)}</span>

              {featured && <AppChip variant="info">{t("Subscription.picker.mostPopular")}</AppChip>}
            </span>

            <span className="flex items-baseline gap-1">
              <span className="text-xl font-bold">
                {formatCommercialAmount(offer.unitPriceMinor, locale, offer.currency)}
              </span>

              <span className="text-xs text-muted-foreground">{t("Subscription.picker.perUserMonth")}</span>
            </span>

            <span className="flex flex-col gap-1.5" role="list">
              {renderedFeatures.map((feature, index) => (
                <span key={index} className="flex items-start gap-1.5 text-xs text-muted-foreground" role="listitem">
                  <Check aria-hidden className="mt-0.5 size-3 shrink-0 text-primary" strokeWidth={2.5} />

                  <span>{feature}</span>
                </span>
              ))}
            </span>
          </button>
        );
      })}
    </div>
  );
});
