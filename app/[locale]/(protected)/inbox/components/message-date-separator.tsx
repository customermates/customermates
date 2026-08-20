"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { useRootStore } from "@/core/stores/root-store.provider";

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export const MessageDateSeparator = observer(({ date }: { date: Date }) => {
  const t = useTranslations();
  const { intlStore } = useRootStore();

  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  const label = isSameDay(date, now)
    ? t("Inbox.dateToday")
    : isSameDay(date, yesterday)
      ? t("Inbox.dateYesterday")
      : intlStore.formatDescriptiveShortDate(date);

  return (
    <div className="sticky top-0 z-10 flex justify-center py-1">
      <span className="w-28 rounded-full border bg-background/95 py-0.5 text-center text-xs font-medium text-muted-foreground shadow-md backdrop-blur">
        {label}
      </span>
    </div>
  );
});
