"use client";

import type { CheckoutState } from "@/ee/subscription/checkout-state";
import type { PurchasablePlanId } from "@/core/commercial/plan-catalog";

import { useTranslations } from "next-intl";

import { Alert } from "@/components/shared/alert";

import { PaymentPendingNotice } from "./payment-pending-notice";
import { PlanPicker, type SelectableOffer } from "./plan-picker";
import { supportMailHref } from "./support-mail-href";

type Props = {
  checkout: CheckoutState;
  isLoading?: boolean;
  onSelect: (offer: SelectableOffer) => void;
  onAbandon: () => void;
  currentFree?: boolean;
  focusPlan?: PurchasablePlanId;
  recommendedPlan?: PurchasablePlanId | null;
  checkoutSeats?: number;
  pausedSeats?: number;
};

export function PlanSelection({
  checkout,
  isLoading,
  onSelect,
  onAbandon,
  currentFree = false,
  focusPlan,
  recommendedPlan = null,
  checkoutSeats,
  pausedSeats = 0,
}: Props) {
  const t = useTranslations();

  if (checkout === "pending") return <PaymentPendingNotice isLoading={isLoading} onAbandon={onAbandon} />;

  const supportHref = supportMailHref(t("CheckoutPending.supportEmailSubject"));

  return (
    <div className="flex w-full flex-col gap-4">
      {checkout === "overdue" ? (
        <Alert id="settings-billing-payment-overdue" role="note" variant="warning">
          <p className="text-x-sm flex flex-wrap gap-x-1">
            <span>{t("CheckoutPending.overdue")}</span>

            {supportHref ? <a href={supportHref}>{t("CheckoutPending.contactSupport")}</a> : null}
          </p>
        </Alert>
      ) : null}

      <PlanPicker
        checkoutSeats={checkoutSeats}
        currentFree={currentFree}
        focusPlan={focusPlan}
        isLoading={isLoading}
        pausedSeats={pausedSeats}
        recommendedPlan={recommendedPlan}
        onSelect={onSelect}
      />
    </div>
  );
}
