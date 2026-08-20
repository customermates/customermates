"use client";

import type { IntlStore } from "@/core/stores/intl.store";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { useRootStore } from "@/core/stores/root-store.provider";

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function resolveSeparatorLabel(
  date: Date,
  now: Date,
  t: (key: string) => string,
  intlStore: Pick<IntlStore, "formatDescriptiveShortDate">,
): string {
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  if (isSameDay(date, now)) return t("Inbox.dateToday");
  if (isSameDay(date, yesterday)) return t("Inbox.dateYesterday");
  return intlStore.formatDescriptiveShortDate(date);
}

export const MessageDateSeparator = observer(({ date }: { date: Date }) => {
  const t = useTranslations();
  const { intlStore } = useRootStore();

  const label = intlStore.rendersZonedValues ? resolveSeparatorLabel(date, new Date(), t, intlStore) : "";

  return (
    <div className="sticky top-0 z-10 flex justify-center py-1">
      <span className="bg-muted text-muted-foreground border-border w-28 rounded-full border py-0.5 text-center text-xs font-medium">
        {label}
      </span>
    </div>
  );
});
