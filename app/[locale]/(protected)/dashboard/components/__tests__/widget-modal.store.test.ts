import type { RootStore } from "@/core/stores/root.store";
import { createCrmPreset } from "@/features/records/crm-preset";
import { RecordWidgetDtoSchema } from "@/features/widget/record-widget.schema";
import { ChartColor, DisplayType, type WidgetDto } from "@/features/widget/widget.schema";
import { WidgetKind } from "@/generated/prisma";
import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { isRecordWidgetForm } from "../record-widget-form";
import { WidgetModalStore } from "../widget-modal.store";

const mocks = vi.hoisted(() => ({
  deleteWidgetAction: vi.fn(),
  getCompanyWidgetsAction: vi.fn(),
  getWidgetByIdAction: vi.fn(),
  upsertRecordWidgetAction: vi.fn(),
  upsertRecordActivityWidgetAction: vi.fn(),
}));
vi.mock("../../actions", () => mocks);
const model = createCrmPreset(randomUUID(), "EUR");
const discovery = {
  contractVersion: 2 as const,
  schemaRevision: model.revision,
  canManageSchema: true,
  total: model.types.length,
  types: model.types
    .filter((type) => !type.embedded)
    .map((type) => ({ ...type, fieldCount: 3, permittedActions: ["readAll" as const] })),
};
const displayOptions = {
  barColors: [ChartColor.primary1],
  displayType: DisplayType.verticalBarChart,
  reverseXAxis: false,
  reverseYAxis: false,
  useGroupColors: true,
  showLegend: true,
  showFilters: true,
};
function chart(name = "Value", id = randomUUID()) {
  return RecordWidgetDtoSchema.parse({
    id,
    name,
    companyId: "company",
    userId: "member",
    kind: "chart",
    contractVersion: 2,
    version: 2,
    measure: {
      source: { typeId: model.types[0].id, filters: [], relationships: [] },
      aggregation: "count",
      valueFieldId: null,
      groupBy: null,
      groupLimit: 100,
    },
    displayOptions,
    layout: null,
    isTemplate: false,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    data: null,
    status: "unavailable",
    groupOptions: [],
  });
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}
function setup() {
  const refresh = vi.fn().mockResolvedValue(undefined),
    removeItem = vi.fn().mockResolvedValue(undefined),
    items: WidgetDto[] = [];
  const root = {
    registerModalStore: vi.fn(),
    userStore: { canAccess: vi.fn(() => true) },
    widgetsStore: { items, refresh, removeItem },
  } as unknown as RootStore;
  const store = new WidgetModalStore(root);
  store.setRecordTypes(discovery);
  return { store, refresh, removeItem, items };
}
function start(store: WidgetModalStore) {
  store.add();
  store.startFromKind(WidgetKind.chart);
  store.onChange("name", "Pipeline");
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCompanyWidgetsAction.mockResolvedValue({ ok: true, data: { widgets: [] } });
  mocks.getWidgetByIdAction.mockResolvedValue(null);
});

describe("generic widget modal", () => {
  it("offers chart and activity creation from accessible metadata", () => {
    const { store } = setup();
    expect(store.availableKinds).toEqual(["chart", "activityTimeline"]);
  });
  it("does not offer creation without accessible records or activity sources", () => {
    const { store } = setup();
    store.setRecordTypes({ ...discovery, types: [] });
    expect(store.availableKinds).not.toContain("chart");
  });
  it("creates a usable chart with the current revision and discovered type", () => {
    const { store } = setup();
    start(store);
    expect(store.form).toMatchObject({
      expectedRevision: 1,
      kind: "chart",
      measure: { aggregation: "count", source: { typeId: discovery.types[0].id } },
    });
  });
  it("resets filters and measures when the source type changes", () => {
    const { store } = setup();
    start(store);
    if (!isRecordWidgetForm(store.form)) throw new Error("chart expected");
    store.onChange("measure.aggregation", "sum");
    store.onChange("measure.valueFieldId", model.types[0].primaryFieldId);
    store.onChange("measure.source.typeId", discovery.types[1].id);
    expect(store.form.measure).toMatchObject({
      aggregation: "count",
      valueFieldId: null,
      source: { typeId: discovery.types[1].id, filters: [], relationships: [] },
    });
  });
  it("opens cached content immediately while refreshing its saved version", async () => {
    const { store, items } = setup(),
      old = chart("Cached"),
      wait = deferred<WidgetDto>();
    items.push(old);
    mocks.getWidgetByIdAction.mockReturnValueOnce(wait.promise);
    const load = store.loadById(old.id);
    expect(store.form.name).toBe("Cached");
    expect(store.isHydrating).toBe(true);
    wait.resolve({ ...old, name: "Persisted", version: 3 });
    await load;
    expect(store.form).toMatchObject({ name: "Persisted", expectedVersion: 3 });
    expect(store.isHydrating).toBe(false);
  });
  it("keeps the latest edit when refreshes finish out of order", async () => {
    const { store } = setup(),
      a = chart("Older"),
      b = chart("Newest"),
      wait = deferred<WidgetDto>();
    mocks.getWidgetByIdAction.mockReturnValueOnce(wait.promise).mockResolvedValueOnce(b);
    const load = store.loadById(a.id);
    await store.loadById(b.id);
    wait.resolve(a);
    await load;
    expect(store.form.name).toBe("Newest");
  });
  it("discards a pending edit when the modal closes", async () => {
    const { store } = setup(),
      old = chart(),
      wait = deferred<WidgetDto>();
    mocks.getWidgetByIdAction.mockReturnValueOnce(wait.promise);
    const load = store.loadById(old.id);
    store.close();
    wait.resolve(old);
    await load;
    expect(store.isOpen).toBe(false);
    expect(store.form.id).toBeUndefined();
  });
  it("does not overwrite a new draft with an earlier load", async () => {
    const { store } = setup(),
      old = chart(),
      wait = deferred<WidgetDto>();
    mocks.getWidgetByIdAction.mockReturnValueOnce(wait.promise);
    const load = store.loadById(old.id);
    start(store);
    wait.resolve(old);
    await load;
    expect(store.form.name).toBe("Pipeline");
    expect(store.form.id).toBeUndefined();
  });
  it("creates a template copy without retaining the owner id or saved version", async () => {
    const { store } = setup(),
      old = chart();
    start(store);
    mocks.getWidgetByIdAction.mockResolvedValueOnce({ ...old, isTemplate: true });
    expect(await store.loadTemplate(old.id)).toBe(true);
    expect(store.form).toMatchObject({ name: "Value", isTemplate: false });
    expect(store.form.id).toBeUndefined();
    expect(store.form.expectedVersion).toBeUndefined();
  });
  it("retains a requested editor section while hydrating", async () => {
    const { store } = setup(),
      old = chart();
    mocks.getWidgetByIdAction.mockResolvedValueOnce(old);
    await store.openWithFilter(old.id, "filters", "owner");
    expect(store.expandedSection).toBe("filters");
    expect(store.expandedFilterField).toBe("owner");
  });
  it("requires a name before sending a mutation", async () => {
    const { store } = setup();
    store.add();
    store.startFromKind(WidgetKind.chart);
    await store.onSubmit();
    expect(mocks.upsertRecordWidgetAction).not.toHaveBeenCalled();
  });
  it("ignores a duplicate submit while saving", async () => {
    const { store } = setup(),
      saved = chart("Pipeline"),
      wait = deferred<{ ok: true; data: WidgetDto }>();
    start(store);
    mocks.upsertRecordWidgetAction.mockReturnValueOnce(wait.promise);
    const submit = store.onSubmit();
    await store.onSubmit();
    expect(mocks.upsertRecordWidgetAction).toHaveBeenCalledOnce();
    wait.resolve({ ok: true, data: saved });
    await submit;
    expect(store.isOpen).toBe(false);
  });
  it("reuses an idempotency key after a failed transport response", async () => {
    const { store } = setup();
    start(store);
    mocks.upsertRecordWidgetAction
      .mockRejectedValueOnce(new Error("connection lost"))
      .mockResolvedValueOnce({ ok: true, data: chart("Pipeline") });
    await expect(store.onSubmit()).rejects.toThrow("connection lost");
    await store.onSubmit();
    expect(mocks.upsertRecordWidgetAction.mock.calls[0][0].idempotencyKey).toBe(
      mocks.upsertRecordWidgetAction.mock.calls[1][0].idempotencyKey,
    );
  });
  it("changes the retry key when the payload changes", async () => {
    const { store } = setup();
    start(store);
    mocks.upsertRecordWidgetAction
      .mockRejectedValueOnce(new Error("connection lost"))
      .mockResolvedValueOnce({ ok: true, data: chart("Changed") });
    await expect(store.onSubmit()).rejects.toThrow();
    store.onChange("name", "Changed");
    await store.onSubmit();
    expect(mocks.upsertRecordWidgetAction.mock.calls[0][0].idempotencyKey).not.toBe(
      mocks.upsertRecordWidgetAction.mock.calls[1][0].idempotencyKey,
    );
  });
  it("retains the persisted version if refresh fails after save", async () => {
    const { store, refresh } = setup(),
      saved = chart("Pipeline");
    start(store);
    mocks.upsertRecordWidgetAction.mockResolvedValueOnce({ ok: true, data: saved });
    refresh.mockRejectedValueOnce(new Error("refresh failed"));
    await expect(store.onSubmit()).rejects.toThrow("refresh failed");
    expect(store.form).toMatchObject({ id: saved.id, expectedVersion: saved.version });
    expect(store.isLoading).toBe(false);
  });
  it("does not let a closed session's save replace a new draft", async () => {
    const { store } = setup(),
      wait = deferred<{ ok: true; data: WidgetDto }>();
    start(store);
    mocks.upsertRecordWidgetAction.mockReturnValueOnce(wait.promise);
    const submit = store.onSubmit();
    store.close();
    start(store);
    store.onChange("name", "New draft");
    wait.resolve({ ok: true, data: chart("Old saved") });
    await submit;
    expect(store.form.name).toBe("New draft");
    expect(store.isOpen).toBe(true);
  });
  it("deletes through the saved id and refreshes the owned collection", async () => {
    const { store, removeItem } = setup(),
      old = chart();
    mocks.getWidgetByIdAction.mockResolvedValueOnce(old);
    await store.loadById(old.id);
    mocks.deleteWidgetAction.mockResolvedValueOnce({ ok: true, data: { id: old.id } });
    expect(await store.delete()).toBe(true);
    expect(mocks.deleteWidgetAction).toHaveBeenCalledWith({ id: old.id });
    expect(removeItem).toHaveBeenCalledWith({ id: old.id });
    expect(store.isOpen).toBe(false);
  });
  it("builds activity drafts from the same generic scope and shared activity kinds", () => {
    const { store } = setup();
    store.add();
    store.startFromKind(WidgetKind.activityTimeline, "Recent activity");
    expect(store.form).toMatchObject({
      kind: "activityTimeline",
      name: "Recent activity",
      contractVersion: 2,
      activityQuery: { scope: { typeIds: [], records: [] }, filters: [] },
    });
  });
  it("initializes a grouping filter without erasing existing source filters", () => {
    const { store } = setup();
    start(store);
    store.onChange("measure.groupBy", { kind: "field", fieldId: model.types[0].primaryFieldId });
    if (!isRecordWidgetForm(store.form)) throw new Error("chart expected");
    expect(store.form.measure.groupBy?.filter).toEqual({ filters: [], relationships: [] });
  });
});
