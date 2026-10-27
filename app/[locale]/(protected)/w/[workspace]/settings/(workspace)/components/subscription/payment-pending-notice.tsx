"use client";

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

type Props = {
  isLoading?: boolean;
  onAbandon: () => void;
};

export function PaymentPendingNotice({ isLoading, onAbandon }: Props) {
  const t = useTranslations();

  return (
    <div
      className="flex w-full flex-col items-center gap-2 rounded-xl border border-border bg-card px-4 py-6 text-center"
      id="settings-billing-payment-pending"
    >
      <Spinner aria-label={t("CheckoutPending.checking")} className="text-primary" size="sm" />

      <p className="text-sm font-semibold">{t("CheckoutPending.title")}</p>

      <p className="text-x-sm max-w-md text-subdued">{t("CheckoutPending.description")}</p>

      <Button
        className="h-auto px-0 py-1"
        disabled={isLoading}
        id="settings-billing-payment-abandon"
        size="sm"
        type="button"
        variant="link"
        onClick={onAbandon}
      >
        {t("CheckoutPending.abandon")}
      </Button>
    </div>
  );
}
