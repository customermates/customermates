import { recordInvariant } from "@/features/records/record-invariant";
import { describe, expect, it } from "vitest";
import { FilterPaletteStore } from "@/components/data-view/filter-palette/filter-palette.store";
import type { RootStore } from "@/core/stores/root.store";
import { FilterOperatorKey as Op } from "@/core/base/base-query-builder";
import type { RecordActivityQuery } from "@/ee/messaging/activities/record-activities.schema";
import { createRecordActivityFilterTarget } from "../record-activity-filter-target";
const typeId = "10000000-0000-4000-8000-000000000001";
const recordId = "10000000-0000-4000-8000-000000000002";
const threadId = "10000000-0000-4000-8000-000000000003";
const labels = {
  source: "Source",
  provider: "Provider",
  account: "Account",
  thread: "Thread",
  after: "After",
  before: "Before",
  saved: "Saved scope",
  unavailable: "Unavailable",
};
function fixture(initial: RecordActivityQuery) {
  let query = initial;
  let disabled = false;
  const target = createRecordActivityFilterTarget({
    read: () => query,
    write: (next) => {
      query = next;
    },
    isDisabled: () => disabled,
    identity: () => query,
    types: () => [{ id: typeId, label: "Deals" }],
    sources: [{ id: "message", label: "Message" }],
    providers: [],
    labels,
  });
  return {
    target,
    read: () => query,
    disable: () => {
      disabled = true;
    },
  };
}
const initial: RecordActivityQuery = {
  scope: { records: [{ typeId, recordId }], typeIds: [] },
  kinds: ["message"],
  filters: [
    { kind: "record", typeId, operator: "hasNone", recordIds: [] },
    { kind: "thread", operator: "notIn", values: [threadId] },
    { kind: "source", operator: "in", values: ["message"] },
  ],
  providers: [],
  threadIds: [threadId],
  after: "2026-01-01T12:30:00Z",
  before: "2026-06-01T12:30:00Z",
};
describe("activity palette host", () => {
  it("round trips predicates and date bounds while preserving the data scope and legacy constraints", () => {
    const f = fixture(initial);
    expect(f.target.groups).toHaveLength(1);
    f.target.setQueryOptions({ filters: recordInvariant(f.target.filters) });
    expect(f.read()).toEqual(initial);
    const saved = recordInvariant(f.target.groups?.[0]).target;
    saved.setQueryOptions({ filters: recordInvariant(saved.filters) });
    expect(f.read()).toEqual(initial);
  });
  it("keeps legacy constraints separately editable and removable", () => {
    const f = fixture(initial);
    const saved = recordInvariant(f.target.groups?.[0]).target;
    saved.removeFilterAt(0);
    expect(f.read().providers).toBeUndefined();
    expect(f.read().filters).toEqual(initial.filters);
    recordInvariant(f.target.groups?.[0]).remove();
    expect(f.read().threadIds).toBeUndefined();
    expect(f.target.groups).toEqual([]);
  });
  it("changes a record presence condition to selected records without changing scope", () => {
    const f = fixture(initial);
    f.target.setQueryOptions({
      filters: [
        { field: `activity:record:${typeId}`, operator: Op.in, value: [recordId] },
        ...recordInvariant(f.target.filters).slice(1),
      ],
    });
    expect(f.read().filters?.[0]).toEqual({ kind: "record", typeId, operator: "in", recordIds: [recordId] });
    expect(f.read().scope).toEqual(initial.scope);
  });
  it("clears every filter including saved constraints without widening the chosen data scope", () => {
    const f = fixture(initial);
    f.target.setQueryOptions({ filters: [], forceRefresh: true });
    expect(f.read()).toEqual({ scope: initial.scope, kinds: initial.kinds, filters: [] });
  });
  it("admits separate date bounds at the twenty-predicate limit and rejects a twenty-first predicate", () => {
    const f = fixture({
      ...initial,
      after: undefined,
      before: undefined,
      filters: Array.from({ length: 20 }, () => ({ kind: "source", operator: "in", values: ["message"] })),
    });
    const root = { registerModalStore: () => undefined, localeStore: { getTranslation: (key: string) => key } };
    const palette = new FilterPaletteStore(root as unknown as RootStore);
    palette.openFor(f.target);
    expect(palette.isAtFilterLimit).toBe(true);
    expect(f.target.canAddField?.("activity:after")).toBe(true);
    expect(f.target.canAddField?.("provider")).toBe(false);
    palette.pickField("activity:after");
    palette.commitNow({ operator: Op.gte, value: "2026-01-01T00:00:00Z" });
    expect(f.read().filters).toHaveLength(20);
    expect(f.read().after).toBe("2026-01-01T00:00:00Z");
    palette.pop();
    palette.pickField("activity:after");
    palette.commitNow({ operator: Op.gte, value: "2026-02-01T00:00:00Z" });
    expect(f.read().after).toBe("2026-02-01T00:00:00Z");
    const before = f.read();
    f.target.setQueryOptions({
      filters: [
        ...recordInvariant(f.target.filters),
        { field: "activity:source", operator: Op.in, value: ["message"] },
      ],
    });
    expect(f.read()).toBe(before);
    f.target.removeFilterAt(20);
    expect(f.read().after).toBeUndefined();
    expect(f.read().filters).toHaveLength(20);
  });
  it("rejects mutation when disabled", () => {
    const f = fixture(initial);
    const saved = recordInvariant(f.target.groups?.[0]);
    f.disable();
    f.target.setQueryOptions({ filters: [], forceRefresh: true });
    saved.remove();
    expect(f.read()).toEqual(initial);
  });
});
