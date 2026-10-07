import type { RootStore } from "@/core/stores/root.store";
import { createCrmPreset } from "@/features/records/crm-preset";
import { RecordWidgetDtoSchema } from "@/features/widget/record-widget.schema";
import { RecordActivityWidgetDtoSchema } from "@/features/widget/record-activity-widget.schema";
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
  getWidgetGalleryAction: vi.fn(),
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
    .map((type) => ({
      ...type,
      fieldCount: 3,
      recordCount: 0,
      permittedActions: ["readAll" as const],
    })),
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
    viewId: null,
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
  mocks.getWidgetGalleryAction.mockResolvedValue({ ok: true, data: { schemaRevision: 1, templates: [] } });
});

describe("generic widget modal", () => {
  it("refreshes an accepted earlier activity widget without replacing a newer chart draft", async () => {
    const { store, refresh } = setup();
    store.add();
    store.startFromKind(WidgetKind.activityTimeline, "Earlier activity");
    const response = deferred<{ ok: true; data: WidgetDto }>();
    mocks.upsertRecordActivityWidgetAction.mockReturnValueOnce(response.promise);
    const save = store.onSubmit();
    store.close();
    start(store);
    store.onChange("name", "Later chart draft");
    response.resolve({
      ok: true,
      data: RecordActivityWidgetDtoSchema.parse({
        id: randomUUID(),
        kind: "activityTimeline",
        contractVersion: 2,
        version: 1,
        userId: "member",
        companyId: "company",
        name: "Earlier activity",
        activityQuery: { scope: { typeIds: [], records: [] }, kinds: ["audit"], filters: [] },
        displayOptions: { showFilters: true },
        layout: null,
        viewId: null,
        isTemplate: false,
        createdAt: new Date(0),
        updatedAt: new Date(0),
        schemaRevision: 1,
        data: null,
        status: "unavailable",
      }),
    });
    await save;
    expect(refresh).toHaveBeenCalledOnce();
    expect(store.form).toMatchObject({ name: "Later chart draft", kind: "chart" });
    expect(store.isOpen).toBe(true);
    expect(store.isLoading).toBe(false);
  });
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
    const { store, refresh } = setup(),
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
    expect(refresh).toHaveBeenCalledOnce();
  });
  it("synchronizes an accepted earlier deletion while preserving the new widget draft", async () => {
    const { store, removeItem } = setup();
    const old = chart("Earlier saved widget");
    const response = deferred<{ ok: true; data: { id: string } }>();
    mocks.getWidgetByIdAction.mockResolvedValueOnce(old);
    await store.loadById(old.id);
    mocks.deleteWidgetAction.mockReturnValueOnce(response.promise);
    const deletion = store.delete();
    store.close();
    start(store);
    store.onChange("name", "Later unsaved widget");
    response.resolve({ ok: true, data: { id: old.id } });
    expect(await deletion).toBe(true);
    expect(removeItem).toHaveBeenCalledWith({ id: old.id });
    expect(store.form.name).toBe("Later unsaved widget");
    expect(store.isOpen).toBe(true);
    expect(store.isLoading).toBe(false);
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

describe("widget preview ownership", () => {
  it("drops a closed widget preview without applying its revision to a new draft", async () => {
    const { store } = setup();
    start(store);
    const wait = deferred<{ schemaRevision: number }>();
    const preview = store.runPreview(() => wait.promise);
    store.close();
    start(store);
    store.onChange("name", "New draft");
    const revision = store.form.expectedRevision;
    wait.resolve({ schemaRevision: revision + 10 });
    expect(await preview).toBeUndefined();
    expect(store.form.name).toBe("New draft");
    expect(store.form.expectedRevision).toBe(revision);
  });

  it("rejects an earlier preview even after its query is selected again", async () => {
    const { store } = setup();
    start(store);
    const wait = deferred<string>();
    const previous = store.runPreview(() => wait.promise);
    store.onChange("measure.aggregation", "sum");
    store.onChange("measure.aggregation", "count");
    expect(await store.runPreview(() => Promise.resolve("Current count"))).toBe("Current count");
    wait.resolve("Old count");
    expect(await previous).toBeUndefined();
  });

  it("ignores a previous session failure while preserving failures for the current query", async () => {
    const { store } = setup();
    start(store);
    let reject!: (error: Error) => void;
    const previous = store.runPreview(
      () =>
        new Promise<string>((_, fail) => {
          reject = fail;
        }),
    );
    store.close();
    start(store);
    reject(new Error("Old query failed"));
    expect(await previous).toBeUndefined();
    await expect(store.runPreview(() => Promise.reject(new Error("Current query failed")))).rejects.toThrow(
      "Current query failed",
    );
  });

  it("keeps a valid preview when appearance changes without changing its data query", async () => {
    const { store } = setup();
    start(store);
    const wait = deferred<string>();
    const preview = store.runPreview(() => wait.promise);
    store.onChange("displayOptions.showLegend", false);
    wait.resolve("Current result");
    expect(await preview).toBe("Current result");
  });

  it("applies the same ownership guard to activity query changes", async () => {
    const { store } = setup();
    store.add();
    store.startFromKind(WidgetKind.activityTimeline, "History");
    const wait = deferred<string>();
    const preview = store.runPreview(() => wait.promise);
    store.onChange("activityQuery.kinds", ["audit"]);
    wait.resolve("Old activity list");
    expect(await preview).toBeUndefined();
  });
});

describe("starter widget gallery", () => {
  const deal = model.types.find((type) => type.label === "Deal");
  const stage = model.fields.find((field) => field.typeId === deal?.id && field.valueType === "select");
  const template = (displayType: DisplayType, groupBy: object | null) => ({
    key: `starter:${displayType}`,
    recipe: displayType === DisplayType.areaChart ? ("valueOverTime" as const) : ("stageFunnel" as const),
    labels: { type: "Deals", group: "Stage" },
    measure: {
      source: { typeId: deal?.id ?? "", filters: [], relationships: [] },
      aggregation: "count" as const,
      valueFieldId: null,
      groupBy,
      groupLimit: 100,
    },
    displayOptions: { ...displayOptions, displayType },
  });

  it("prefetches templates with the record types so the chooser opens without a layout shift", async () => {
    mocks.getWidgetGalleryAction.mockResolvedValue({
      ok: true,
      data: { schemaRevision: 7, templates: [template(DisplayType.number, null)] },
    });
    const { store } = setup();
    await vi.waitFor(() => expect(store.galleryTemplates).toHaveLength(1));
    const loaded = store.galleryTemplates;
    store.add();
    expect(store.galleryTemplates).toBe(loaded);
    await vi.waitFor(() => expect(mocks.getWidgetGalleryAction).toHaveBeenCalledTimes(2));
    expect(store.galleryTemplates).toBe(loaded);
    store.setRecordTypes(discovery, { schemaRevision: 8, templates: [] });
    expect(store.galleryTemplates).toEqual([]);
  });

  it("loads the resolved templates and starts an editable draft without the source-type reset", async () => {
    const funnel = template(DisplayType.funnelChart, { path: [], fieldId: stage?.id });
    const area = template(DisplayType.areaChart, { path: [], fieldId: "system:createdAt", dateInterval: "month" });
    mocks.getWidgetGalleryAction.mockResolvedValue({
      ok: true,
      data: { schemaRevision: 7, templates: [funnel, area] },
    });
    const { store } = setup();
    store.add();
    await vi.waitFor(() => expect(store.galleryTemplates).toHaveLength(2));
    expect(store.form.kind === "chart" && store.form.measure.source.typeId).not.toBe(deal?.id);
    store.startFromGallery(store.galleryTemplates[0], "Deals by stage");
    expect(store.creationStep).toBe("configure");
    expect(store.form).toMatchObject({
      name: "Deals by stage",
      expectedRevision: 7,
      displayOptions: { displayType: DisplayType.funnelChart },
      measure: { aggregation: "count", groupBy: { path: [], fieldId: stage?.id } },
    });
    expect(store.hasUnsavedChanges).toBe(false);
    store.setCreationStep("choose");
    store.startFromGallery(store.galleryTemplates[1], "Won value per month");
    expect(store.form).toMatchObject({
      displayOptions: { displayType: DisplayType.areaChart },
      measure: { groupBy: { dateInterval: "month", timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone } },
    });
    store.onChange("measure.aggregation", "sum");
    expect(store.form.kind === "chart" && store.form.measure.aggregation).toBe("sum");
  });
});
