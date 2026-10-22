import type { PlannerEntry } from "@/features/planner/planner-entries";

import { useRecordValueFormat } from "@/components/records/record-value";

export function usePlannerEntryDateLabel(timeZone: string) {
  const format = useRecordValueFormat();
  return (item: PlannerEntry) => {
    const { start, end, time } = item.entry;
    const date = (day: string) => format.date(new Date(`${day}T00:00:00Z`), { dateStyle: "full", timeZone: "UTC" });
    const instant = (value: string) =>
      format.date(new Date(value), { dateStyle: "full", timeStyle: "short", timeZone });
    const first = time ? instant(time) : date(start);
    const last = time && item.endInstant ? instant(item.endInstant) : end !== start ? date(end) : null;
    return last && last !== first ? `${first} – ${last}` : first;
  };
}
