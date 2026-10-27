"use client";

import type { CheckoutState } from "@/ee/subscription/checkout-state";

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
};

export function PlanSelection({ checkout, isLoading, onSelect, onAbandon }: Props) {
  const t = useTranslations();

  if (checkout === "pending") return <PaymentPendingNotice isLoading={isLoading} onAbandon={onAbandon} />;

  const supportHref = supportMailHref(t("CheckoutPending.supportEmailSubject"));

  return (
    <div className="flex w-full flex-col gap-4">
      {checkout === "overdue" ? (
        <Alert color="warning" id="settings-billing-payment-overdue" role="note">
          <p className="text-x-sm flex flex-wrap gap-x-1">
            <span>{t("CheckoutPending.overdue")}</span>

            {supportHref ? <a href={supportHref}>{t("CheckoutPending.contactSupport")}</a> : null}
          </p>
        </Alert>
      ) : null}

      <PlanPicker isLoading={isLoading} onSelect={onSelect} />
    </div>
  );
}
