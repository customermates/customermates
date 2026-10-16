"use client";

import { useTranslations } from "next-intl";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { billingUsageWindow } from "@/ee/operator/billing-usage";

type Props = {
  id: string;
  months: readonly string[];
  value: string;
  onValueChange: (month: string) => void;
};

export function OperatorUsageMonthSelect({ id, months, value, onValueChange }: Props) {
  const t = useTranslations();
  const intlStore = useHydratedIntlStore();

  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger aria-label={t("OperatorUsage.month")} className="w-56" id={id}>
        <SelectValue placeholder={t("OperatorUsage.month")} />
      </SelectTrigger>

      <SelectContent>
        {months.map((month) => (
          <SelectItem key={month} textValue={month} value={month}>
            {intlStore.formatMonthYear(billingUsageWindow(month).from, { timeZone: "UTC" })}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
