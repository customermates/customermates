import { billingUsageMonthsBetween } from "@/ee/operator/billing-usage";

const RECENT_MONTHS = 36;

export function operatorUsageMonths(first: Date, now: Date, selected?: string): string[] {
  const months = billingUsageMonthsBetween(first, now);
  if (!selected || months.includes(selected)) return months;

  return [...months, selected].sort().reverse();
}

export function recentOperatorUsageMonths(now: Date, selected: string): string[] {
  const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (RECENT_MONTHS - 1), 1));

  return operatorUsageMonths(first, now, selected);
}
