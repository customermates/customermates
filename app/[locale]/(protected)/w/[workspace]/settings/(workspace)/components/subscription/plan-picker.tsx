"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Check } from "lucide-react";
import { observer } from "mobx-react-lite";

import { AppChip } from "@/components/chip/app-chip";
import { Button } from "@/components/ui/button";
import { cn } from "@/core/utils/cn";
import { usePlanFit } from "@/app/components/upsell/use-plan-fit";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import {
  CLOUD_TRIAL,
  FREE_PLAN_USAGE_LIMITS,
  formatCommercialAmount,
  PLAN_CATALOG,
  PURCHASABLE_PLAN_IDS,
  TEAM_PLAN_ID,
  totalPriceAmountMinor,
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
  currentFree?: boolean;
  focusPlan?: PurchasablePlanId;
  recommendedPlan?: PurchasablePlanId | null;
  checkoutSeats?: number;
  pausedSeats?: number;
};

export const PlanPicker = observer(function PlanPicker({
  isLoading,
  onSelect,
  currentFree = false,
  focusPlan,
  recommendedPlan = null,
  checkoutSeats,
  pausedSeats = 0,
}: Props) {
  const t = useTranslations();
  const intlStore = useHydratedIntlStore();
  const locale = intlStore.resolvedFormattingLanguageTag;
  const focusedPlan = focusPlan ?? recommendedPlan ?? undefined;
  const highlightedPlan = focusedPlan ?? CLOUD_TRIAL.plan;
  const focusedCard = useRef<HTMLDivElement | null>(null);
  const connectedPerUser = usePlanFit(true)?.maxAccountsPerUser ?? 0;

  useEffect(() => {
    if (focusPlan) focusedCard.current?.scrollIntoView?.({ block: "center" });
  }, [focusPlan]);

  function handleSelect(offer: SelectableOffer) {
    if (!isLoading) onSelect(offer);
  }

  return (
    <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2" id="settings-billing-plan-picker">
      {currentFree ? (
        <div
          className="flex flex-col gap-1 rounded-xl border border-dashed border-border bg-card px-4 py-3 sm:col-span-2"
          data-current="true"
          data-plan="free"
        >
          <span className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold">{t("Subscription.picker.freeCurrent")}</span>

            <span className="text-sm font-semibold tabular-nums">{formatCommercialAmount(0, locale)}</span>
          </span>

          <span className="text-xs text-muted-foreground">
            {t("Subscription.picker.freeSummary", {
              members: FREE_PLAN_USAGE_LIMITS.maxMembers,
              records: intlStore.formatNumber(FREE_PLAN_USAGE_LIMITS.maxRecords),
            })}
          </span>

          {pausedSeats > 0 && checkoutSeats ? (
            <span className="text-xs text-foreground" data-checkout-seats-note="">
              {t("Subscription.picker.seatsIncludePaused", { count: checkoutSeats, paused: pausedSeats })}
            </span>
          ) : null}
        </div>
      ) : null}

      {PURCHASABLE_PLAN_IDS.map((plan) => {
        const featured = plan === highlightedPlan;
        const recommended = plan === recommendedPlan;
        const forTeams = plan === TEAM_PLAN_ID;
        const planName = t(`Subscription.planNames.${plan}`);
        const offer = PLAN_CATALOG[plan].offers.monthly;
        const selection: SelectableOffer = { plan, cadence: offer.cadence };
        const accountAllowance = PLAN_CATALOG[plan].entitlements.includedAccountsPerUser;
        const routineAllowance = PLAN_CATALOG[plan].entitlements.includedRoutinesPerUser;
        const multiplier = PLAN_CATALOG[plan].entitlements.hostedAiUsageMultiplier;
        const features = t.raw(`Subscription.picker.features.${plan}`) as string[];
        const renderedFeatures = [
          ...features,
          ...(accountAllowance === 0
            ? []
            : [t("Subscription.picker.connectedAccountsPerUser", { accounts: accountAllowance })]),
          routineAllowance === "unlimited"
            ? t("Subscription.picker.unlimitedRoutinesPerUser")
            : t("Subscription.picker.routinesPerUser", { routines: routineAllowance }),
          ...(typeof multiplier === "number" ? [t("Subscription.picker.hostedAiUsage", { multiplier })] : []),
        ];

        return (
          <div
            key={plan}
            ref={plan === focusedPlan ? focusedCard : undefined}
            className={cn(
              "relative flex flex-col gap-3 rounded-xl border bg-card p-4",
              featured ? "border-foreground/80 shadow-sm ring-1 ring-foreground/80" : "border-border",
            )}
            data-featured={featured ? "true" : undefined}
            data-focused={plan === focusedPlan ? "true" : undefined}
            data-plan={plan}
            data-recommended={recommended ? "true" : undefined}
          >
            {recommended ? (
              <span
                className="absolute -top-2.5 left-4 inline-flex h-5 items-center rounded-full bg-foreground px-2 text-[11px] font-medium text-background"
                data-recommended-badge=""
              >
                {t("Subscription.picker.recommendedForYou")}
              </span>
            ) : null}

            <span className="flex flex-col gap-1">
              <span className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">{planName}</span>

                {plan === CLOUD_TRIAL.plan && !recommended && (
                  <AppChip>{t("Subscription.picker.bestForFollowUp")}</AppChip>
                )}

                {forTeams && <AppChip>{t("Subscription.picker.forTeams")}</AppChip>}
              </span>

              <span className="text-xs text-muted-foreground">{t(`Subscription.picker.taglines.${plan}`)}</span>
            </span>

            <span className="flex items-baseline gap-1">
              <span className="text-xl font-bold tabular-nums">
                {formatCommercialAmount(offer.unitPriceMinor, locale, offer.currency)}
              </span>

              <span className="text-xs text-muted-foreground">{t("Subscription.picker.perUserMonth")}</span>
            </span>

            {checkoutSeats && checkoutSeats > 0 ? (
              <span className="-mt-2 text-xs text-muted-foreground tabular-nums" data-checkout-seats={checkoutSeats}>
                {t("Subscription.picker.seatTotal", {
                  count: checkoutSeats,
                  total: formatCommercialAmount(totalPriceAmountMinor(offer, checkoutSeats), locale, offer.currency),
                })}
              </span>
            ) : null}

            <Button
              className="w-full"
              disabled={isLoading}
              type="button"
              variant={featured ? "ink" : "secondary"}
              onClick={() => handleSelect(selection)}
            >
              {t("Subscription.picker.choose", { plan: planName })}
            </Button>

            <span className="flex flex-col gap-1.5" role="list">
              {renderedFeatures.map((feature, index) => (
                <span key={index} className="flex items-start gap-1.5 text-xs text-muted-foreground" role="listitem">
                  <Check aria-hidden className="mt-0.5 size-3 shrink-0 text-muted-foreground" strokeWidth={2.5} />

                  <span>{feature}</span>
                </span>
              ))}
            </span>

            {typeof accountAllowance === "number" && accountAllowance > 0 && connectedPerUser > accountAllowance ? (
              <span className="text-xs text-foreground" data-account-overage="">
                {t("Subscription.picker.keepsAccounts", { kept: accountAllowance, connected: connectedPerUser })}
              </span>
            ) : null}
          </div>
        );
      })}

      <p className="text-muted-foreground text-xs sm:col-span-2">{t("Subscription.picker.creditNote")}</p>
    </div>
  );
});
