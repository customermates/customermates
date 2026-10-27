import type { ChipColor } from "@/constants/chip-colors";
import type { CalendarViewMode, CalendarWindow } from "@/core/data-view/calendar-view-config.schema";
import type { PlannerConfig } from "@/features/planner/planner.schema";
import type { PlannerResult } from "@/features/planner/read-planner.interactor";
import type { PlannerEntry } from "@/features/planner/planner-entries";
import type { RecordRow } from "@/features/records/record-presentation";
import type { RecordCalendarViewStore } from "../../records/[typeId]/components/record-calendar-view";
import type { RecordExplorationStore } from "../../records/[typeId]/components/record-exploration.store";

import { calendarEntryColor } from "../../records/[typeId]/components/record-calendar-layout";
import { resolveCalendarFields } from "@/features/record-calendar/record-calendar-query";

export function plannerEntryColors(config: PlannerConfig, result: PlannerResult): (item: PlannerEntry) => ChipColor {
  const colors = new Map(
    config.sources.map((source) => {
      const data = result.sources.find((data) => data.source.id === source.id);
      const fields =
        data?.status === "ready"
          ? resolveCalendarFields(source.typeId, source.calendar, data.presentation.model.fields)
          : null;
      return [source.id, { color: source.color, field: fields?.color ?? null }] as const;
    }),
  );
  return (item) => {
    const source = colors.get(item.sourceId);
    if (!source) return "secondary";
    return source.field ? calendarEntryColor(item.entry, source.field) : source.color;
  };
}

export function plannerCalendarAdapter({
  stores,
  colors,
  entries,
  anchor,
  mode,
  window,
  refreshing,
  refresh,
  navigate,
  create,
}: {
  stores: ReadonlyMap<string, RecordExplorationStore>;
  colors: (item: PlannerEntry) => ChipColor;
  entries: PlannerEntry[];
  anchor: string;
  mode: CalendarViewMode;
  window: CalendarWindow;
  refreshing: boolean;
  refresh: () => Promise<void>;
  navigate: (date: string) => void;
  create: ((date: string, minutes: number | null, opener?: HTMLElement | null) => void) | null;
}): RecordCalendarViewStore {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const rows: RecordRow[] = entries.map((item) =>
    item.record
      ? { ...item.record, id: item.id }
      : {
          id: item.id,
          ref: { typeId: item.sourceId, recordId: item.id.slice(6) },
          version: 1,
          schemaRevision: 0,
          createdAt: item.entry.time ?? item.entry.start,
          updatedAt: item.entry.time ?? item.entry.start,
          fields: [],
          assignedUserIds: [],
          assignedUsers: [],
          memberUsers: [],
          relationships: [],
        },
  );
  return {
    calendar: null,
    calendarFields: null,
    calendarFocusDate: anchor,
    calendarMode: mode,
    calendarWindow: window,
    calendarRange: { ...window, total: entries.length, truncated: false },
    calendarResultSeq: 1,
    isRefreshing: refreshing,
    items: rows,
    normalizedCalendarItems: () =>
      rows.flatMap((record) => {
        const item = byId.get(record.id);
        return item ? [{ record, entry: item.entry }] : [];
      }),
    calendarColorForItem: (item) => {
      const entry = byId.get(item.record.id);
      return entry ? colors(entry) : "secondary";
    },
    canMoveCalendarRecord: (row) => {
      const item = byId.get(row.id);
      return Boolean(item?.record && stores.get(item.sourceId)?.canMoveCalendarRecord(item.record));
    },
    canResizeCalendarRecord: (row) => {
      const item = byId.get(row.id);
      return Boolean(item?.record && stores.get(item.sourceId)?.canResizeCalendarRecord(item.record));
    },
    moveCalendarRecord: async (row, edit) => {
      const item = byId.get(row.id);
      const store = item && stores.get(item.sourceId);
      if (!store || !item.record) return { saved: false };
      return store.moveCalendarRecord(item.record, edit);
    },
    canCreateCalendarRecord: Boolean(create),
    createCalendarRecord: (date, minutes, opener) => create?.(date, minutes, opener),
    refreshQuery: refresh,
    setCalendarAnchor: navigate,
    setCalendarDisplayMode: () => undefined,
    setViewOptions: () => undefined,
  };
}
