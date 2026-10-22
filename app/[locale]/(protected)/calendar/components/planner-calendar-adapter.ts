import type { RootStore } from "@/core/stores/root.store";
import type { CalendarViewMode, CalendarWindow } from "@/core/data-view/calendar-view-config.schema";
import type { PlannerConfig } from "@/features/planner/planner.schema";
import type { PlannerResult } from "@/features/planner/read-planner.interactor";
import type { PlannerEntry } from "@/features/planner/planner-entries";
import type { RecordRow } from "@/features/records/record-presentation";
import type { RecordCalendarViewStore } from "../../records/[typeId]/components/record-calendar-view";

import { RecordExplorationStore } from "../../records/[typeId]/components/record-exploration.store";
import { shiftCalendarEntry } from "../../records/[typeId]/components/record-calendar-layout";
import { calendarEntryColor } from "../../records/[typeId]/components/record-calendar-layout";
import { resolveCalendarFields } from "@/features/record-calendar/record-calendar-query";

export function plannerCalendarAdapter({
  root,
  result,
  config,
  entries,
  anchor,
  mode,
  window,
  refreshing,
  refresh,
  navigate,
}: {
  root: RootStore;
  result: PlannerResult;
  config: PlannerConfig;
  entries: PlannerEntry[];
  anchor: string;
  mode: CalendarViewMode;
  window: CalendarWindow;
  refreshing: boolean;
  refresh: () => Promise<void>;
  navigate: (date: string) => void;
}): RecordCalendarViewStore {
  const stores = new Map(
    result.sources.flatMap((data) =>
      data.status === "ready" ? [[data.source.id, new RecordExplorationStore(root, data.presentation)] as const] : [],
    ),
  );
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const rows: RecordRow[] = entries.map((item) =>
    item.record
      ? { ...item.record, id: item.id }
      : {
          id: item.id,
          ref: { typeId: item.sourceId, recordId: item.id.slice(6) },
          version: 1,
          schemaRevision: 0,
          createdAt: item.updatedAt,
          updatedAt: item.updatedAt,
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
    normalizedCalendarItems: (pending) =>
      rows.flatMap((record) => {
        const item = byId.get(record.id);
        return item
          ? [{ record, entry: shiftCalendarEntry(item.entry, pending.get(record.id) ?? 0, window.timeZone) }]
          : [];
      }),
    calendarColorForItem: (item) => {
      const entry = byId.get(item.record.id);
      const source = config.sources.find((source) => source.id === entry?.sourceId);
      const data = result.sources.find((data) => data.source.id === source?.id);
      const fields =
        data?.status === "ready" && source
          ? resolveCalendarFields(source.typeId, source.calendar, data.presentation.model.fields)
          : null;
      return fields?.color ? calendarEntryColor(item.entry, fields.color) : (source?.color ?? "secondary");
    },
    canMoveCalendarRecord: (row) => {
      const item = byId.get(row.id);
      return Boolean(item?.record && stores.get(item.sourceId)?.canMoveCalendarRecord(item.record));
    },
    moveCalendarRecord: async (row, target) => {
      const item = byId.get(row.id);
      const store = item && stores.get(item.sourceId);
      if (!store || !item.record) return { saved: false };
      const outcome = await store.moveCalendarRecord(item.record, target);
      if (outcome.saved) await refresh();
      return outcome;
    },
    refreshQuery: refresh,
    setCalendarAnchor: navigate,
    setCalendarDisplayMode: () => undefined,
    setViewOptions: () => undefined,
  };
}
