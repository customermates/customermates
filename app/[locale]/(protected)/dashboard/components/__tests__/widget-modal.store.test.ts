import type { RootStore } from "@/core/stores/root.store";
import type { ActivityWidgetDto, ChartWidgetDto, CompanyWidget } from "@/features/widget/widget.schema";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { Filter } from "@/core/base/base-get.schema";

import { beforeEach, describe, expect, it, vi } from "vitest";
import { toJS } from "mobx";
import { AggregationType, CustomColumnType, EntityType, WidgetGroupByType, WidgetKind } from "@/generated/prisma";
import { FilterOperatorKey } from "@/core/base/base-query-builder";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { ChartColor, DisplayType } from "@/features/widget/widget.schema";

import { WidgetModalStore } from "../widget-modal.store";

const actionMocks = vi.hoisted(() => ({
  deleteWidgetAction: vi.fn(),
  getCompanyWidgetsAction: vi.fn(),
  getWidgetByIdAction: vi.fn(),
  upsertWidgetAction: vi.fn(),
}));

vi.mock("../../actions", () => actionMocks);

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function chartWidget(id: string, name: string): ChartWidgetDto {
  return {
    id,
    userId: "user-1",
    companyId: "company-1",
    name,
    layout: null,
    isTemplate: false,
    createdAt: new Date("2026-08-05T00:00:00.000Z"),
    updatedAt: new Date("2026-08-05T00:00:00.000Z"),
    kind: WidgetKind.chart,
    entityType: EntityType.contact,
    entityFilters: [],
    dealFilters: [],
    displayOptions: null,
    groupByType: WidgetGroupByType.none,
    groupByCustomColumnId: null,
    aggregationType: AggregationType.count,
    data: [],
  };
}

function activityWidget(id: string, name: string): ActivityWidgetDto {
  return {
    id,
    userId: "user-1",
    companyId: "company-1",
    name,
    layout: null,
    isTemplate: true,
    createdAt: new Date("2026-08-05T00:00:00.000Z"),
    updatedAt: new Date("2026-08-05T00:00:00.000Z"),
    kind: WidgetKind.activityTimeline,
    timelineFilters: [
      {
        field: FilterFieldKey.timelineKind,
        operator: FilterOperatorKey.in,
        value: ["messages"],
      },
    ],
    displayOptions: { showFilters: false },
  };
}

function configuredChartWidget(id: string, name: string): ChartWidgetDto {
  return {
    ...chartWidget(id, name),
    isTemplate: true,
    entityFilters: [
      {
        field: FilterFieldKey.userIds,
        operator: FilterOperatorKey.in,
        value: ["10000000-0000-4000-8000-000000000001"],
      },
    ],
    dealFilters: [
      {
        field: FilterFieldKey.userIds,
        operator: FilterOperatorKey.notIn,
        value: ["10000000-0000-4000-8000-000000000002"],
      },
    ],
    displayOptions: {
      barColors: [ChartColor.success1],
      displayType: DisplayType.horizontalBarChartWithLabels,
      reverseXAxis: true,
      reverseYAxis: true,
      useGroupColors: false,
      showLegend: false,
      showFilters: false,
    },
    groupByType: WidgetGroupByType.customColumn,
    groupByCustomColumnId: "10000000-0000-4000-8000-000000000003",
    aggregationType: AggregationType.dealValue,
  };
}

function activityWidgetWithConversation(id: string, name: string): ActivityWidgetDto {
  return {
    ...activityWidget(id, name),
    timelineFilters: [
      {
        field: FilterFieldKey.timelineKind,
        operator: FilterOperatorKey.in,
        value: ["messages"],
      },
      {
        field: FilterFieldKey.connectedAccountId,
        operator: FilterOperatorKey.in,
        value: ["account-1"],
      },
      {
        field: FilterFieldKey.timelineThreadId,
        operator: FilterOperatorKey.in,
        value: ["thread-1"],
      },
    ],
  };
}

function companyWidget(id: string, name: string): CompanyWidget {
  return {
    id,
    kind: WidgetKind.chart,
    name,
    firstName: "Max",
    lastName: "Bergmann",
    avatarUrl: null,
  };
}

function createStoreWithMocks() {
  const refresh = vi.fn();
  const removeItem = vi.fn();
  const rootStore = {
    registerModalStore: vi.fn(),
    userStore: { can: vi.fn(() => true), canAccess: vi.fn(() => true) },
    widgetsStore: { refresh, removeItem },
  } as unknown as RootStore;

  return { store: new WidgetModalStore(rootStore), refresh, removeItem };
}

function createStore(): WidgetModalStore {
  return createStoreWithMocks().store;
}

function enableActivity(store: WidgetModalStore) {
  store.setActivityFilterableFields([
    {
      field: FilterFieldKey.timelineKind,
      operators: [FilterOperatorKey.in, FilterOperatorKey.notIn],
    },
    {
      field: FilterFieldKey.connectedAccountId,
      operators: [FilterOperatorKey.in, FilterOperatorKey.notIn],
    },
    {
      field: FilterFieldKey.timelineThreadId,
      operators: [FilterOperatorKey.in, FilterOperatorKey.notIn],
    },
    {
      field: FilterFieldKey.contactIds,
      operators: [FilterOperatorKey.in, FilterOperatorKey.notIn, FilterOperatorKey.hasSome, FilterOperatorKey.hasNone],
    },
  ]);
}

function startChart(store: WidgetModalStore) {
  store.add();
  store.startFromKind(WidgetKind.chart);
  store.onChange("name", "Preview matrix");
}

function setChartFilterableFields(store: WidgetModalStore) {
  store.setFilterableFields({
    [EntityType.contact]: [
      {
        field: FilterFieldKey.userIds,
        operators: [FilterOperatorKey.in, FilterOperatorKey.notIn],
      },
    ],
    [EntityType.organization]: [
      {
        field: FilterFieldKey.createdAt,
        operators: [FilterOperatorKey.inLastDays],
      },
    ],
    [EntityType.deal]: [
      {
        field: FilterFieldKey.userIds,
        operators: [FilterOperatorKey.in, FilterOperatorKey.notIn],
      },
    ],
    [EntityType.service]: [],
    [EntityType.task]: [],
  });
}

function currentChartForm(store: WidgetModalStore) {
  if (store.form.kind !== WidgetKind.chart) throw new Error("Expected a chart form");
  return store.form;
}

function activityFilterIndex(
  store: WidgetModalStore,
  field: NonNullable<ActivityWidgetDto["timelineFilters"]>[number]["field"],
): number {
  if (store.form.kind !== WidgetKind.activityTimeline) throw new Error("Expected an activity form");
  const index = store.form.timelineFilters?.findIndex((filter) => String(filter.field) === String(field)) ?? -1;
  if (index < 0) throw new Error(`Missing activity filter ${field}`);
  return index;
}

function singleSelectColumn(entityType: EntityType, index: number): CustomColumnDto {
  return {
    id: `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    entityType,
    label: `${entityType} stage`,
    type: CustomColumnType.singleSelect,
    options: {
      options: [
        {
          value: "active",
          label: "Active",
          color: "success",
          index: 0,
          isDefault: true,
        },
      ],
    },
  };
}

const validDealFilter = {
  field: FilterFieldKey.userIds,
  operator: FilterOperatorKey.in,
  value: ["10000000-0000-4000-8000-000000000001"],
} satisfies Filter;

describe("WidgetModalStore chart combinations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    actionMocks.getCompanyWidgetsAction.mockResolvedValue({
      ok: true,
      data: { widgets: [] },
    });
  });

  it.each([
    [EntityType.contact, [AggregationType.count, AggregationType.dealValue]],
    [EntityType.organization, [AggregationType.count, AggregationType.dealValue]],
    [EntityType.deal, [AggregationType.count, AggregationType.dealValue]],
    [EntityType.service, [AggregationType.count, AggregationType.dealValue, AggregationType.dealQuantity]],
    [EntityType.task, [AggregationType.count]],
  ])("offers only compatible metrics for %s", (entityType, expected) => {
    const store = createStore();
    startChart(store);
    store.onChange("entityType", entityType);

    expect(store.aggregationTypeOptions.map(({ key }) => key)).toEqual(expected);
  });

  it("offers custom grouping for every entity and relation grouping only for non-count metrics", () => {
    const store = createStore();
    const columns = Object.values(EntityType).map((entityType, index) => singleSelectColumn(entityType, index + 1));
    store.setCustomColumns(columns);
    startChart(store);

    for (const entityType of Object.values(EntityType)) {
      store.onChange("entityType", entityType);
      expect(store.groupBySelectOptions.map(({ key }) => key)).toEqual([
        WidgetGroupByType.none,
        `custom:${columns.find((column) => column.entityType === entityType)?.id}`,
      ]);

      if (entityType === EntityType.task) continue;
      store.onChange(
        "aggregationType",
        entityType === EntityType.service ? AggregationType.dealQuantity : AggregationType.dealValue,
      );
      expect(store.groupBySelectOptions.map(({ key }) => key)).toEqual([
        WidgetGroupByType.none,
        entityType,
        `custom:${columns.find((column) => column.entityType === entityType)?.id}`,
      ]);
    }
  });

  it("drops relation grouping for Count while retaining valid custom grouping", async () => {
    const store = createStore();
    const column = singleSelectColumn(EntityType.contact, 1);
    store.setCustomColumns([column]);
    startChart(store);
    store.onChange("entityType", EntityType.contact);
    store.onChange("aggregationType", AggregationType.dealValue);
    store.onGroupByChange(WidgetGroupByType.contact);

    await vi.waitFor(() => expect(currentChartForm(store).groupByType).toBe(WidgetGroupByType.contact));

    store.onChange("aggregationType", AggregationType.count);
    await vi.waitFor(() => expect(currentChartForm(store).groupByType).toBe(WidgetGroupByType.none));

    store.onGroupByChange(`custom:${column.id}`);
    await vi.waitFor(() => expect(currentChartForm(store).groupByType).toBe(WidgetGroupByType.customColumn));
    expect(currentChartForm(store).groupByCustomColumnId).toBe(column.id);
  });

  it.each([
    ["Count", (store: WidgetModalStore) => store.onChange("aggregationType", AggregationType.count)],
    ["Deal entity", (store: WidgetModalStore) => store.onChange("entityType", EntityType.deal)],
  ])("does not count or submit a hidden Deal filter after switching to %s", async (_label, transition) => {
    const store = createStore();
    setChartFilterableFields(store);
    startChart(store);
    store.onChange("entityType", EntityType.organization);
    store.onChange("aggregationType", AggregationType.dealValue);
    store.onChange("dealFilters", [validDealFilter]);

    expect(store.showDealFiltersTab).toBe(true);
    expect(store.activeDealFiltersCount).toBe(1);

    transition(store);

    expect(store.showDealFiltersTab).toBe(false);
    expect(store.activeDealFiltersCount).toBe(0);
    actionMocks.upsertWidgetAction.mockResolvedValue({
      ok: true,
      data: chartWidget("new-widget", "Preview matrix"),
    });

    await store.onSubmit();

    expect(actionMocks.upsertWidgetAction).toHaveBeenCalledWith(
      expect.objectContaining({
        dealFilters: undefined,
      }),
    );
  });

  it("submits a visible Deal filter unchanged for a compatible metric", async () => {
    const store = createStore();
    setChartFilterableFields(store);
    startChart(store);
    store.onChange("entityType", EntityType.organization);
    store.onChange("aggregationType", AggregationType.dealValue);
    store.onChange("dealFilters", [validDealFilter]);

    expect(store.showDealFiltersTab).toBe(true);
    expect(store.activeDealFiltersCount).toBe(1);
    actionMocks.upsertWidgetAction.mockResolvedValue({
      ok: true,
      data: chartWidget("new-widget", "Preview matrix"),
    });

    await store.onSubmit();

    expect(actionMocks.upsertWidgetAction).toHaveBeenCalledWith(
      expect.objectContaining({
        aggregationType: AggregationType.dealValue,
        dealFilters: [validDealFilter],
        entityType: EntityType.organization,
      }),
    );
  });

  it("resets entity-specific metric, grouping, and filters when the entity changes", async () => {
    const store = createStore();
    const column = singleSelectColumn(EntityType.contact, 1);
    setChartFilterableFields(store);
    store.setCustomColumns([column]);
    startChart(store);
    store.onChange("entityType", EntityType.contact);
    store.onChange("aggregationType", AggregationType.dealValue);
    store.onGroupByChange(`custom:${column.id}`);
    store.onChange("entityFilters", [validDealFilter]);

    await vi.waitFor(() => expect(currentChartForm(store).groupByType).toBe(WidgetGroupByType.customColumn));
    expect(currentChartForm(store).groupByCustomColumnId).toBe(column.id);
    expect(store.groupBySelectValue).toBe(`custom:${column.id}`);
    expect(store.activeFiltersCount).toBe(1);

    store.onChange("entityType", EntityType.organization);

    await vi.waitFor(() => expect(currentChartForm(store).aggregationType).toBe(AggregationType.count));
    expect(currentChartForm(store).groupByType).toBe(WidgetGroupByType.none);
    expect(currentChartForm(store).groupByCustomColumnId).toBeUndefined();
    expect(store.groupBySelectValue).toBe(WidgetGroupByType.none);
    expect(currentChartForm(store).entityFilters).toEqual([
      {
        field: FilterFieldKey.createdAt,
        operator: undefined,
        value: undefined,
      },
    ]);
    expect(store.activeFiltersCount).toBe(0);
  });
});

describe("WidgetModalStore loads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    actionMocks.getCompanyWidgetsAction.mockResolvedValue({
      ok: true,
      data: { widgets: [] },
    });
  });

  it("keeps the newest edit when requests finish out of order", async () => {
    const first = deferred<ChartWidgetDto>();
    const second = deferred<ChartWidgetDto>();
    actionMocks.getWidgetByIdAction.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const store = createStore();

    const firstLoad = store.loadById("11111111-1111-4111-8111-111111111111");
    const secondLoad = store.loadById("22222222-2222-4222-8222-222222222222");

    second.resolve(chartWidget("22222222-2222-4222-8222-222222222222", "Newest"));
    await secondLoad;
    first.resolve(chartWidget("11111111-1111-4111-8111-111111111111", "Stale"));
    await firstLoad;

    expect(store.form.id).toBe("22222222-2222-4222-8222-222222222222");
    expect(store.form.name).toBe("Newest");
    expect(store.isHydrating).toBe(false);
    expect(store.isLoading).toBe(false);
  });

  it("orders edit and template requests with the same generation", async () => {
    const edit = deferred<ChartWidgetDto>();
    const template = deferred<ChartWidgetDto>();
    actionMocks.getWidgetByIdAction.mockReturnValueOnce(edit.promise).mockReturnValueOnce(template.promise);
    const store = createStore();

    const editLoad = store.loadById("11111111-1111-4111-8111-111111111111");
    const templateLoad = store.loadTemplate("22222222-2222-4222-8222-222222222222");

    template.resolve(chartWidget("22222222-2222-4222-8222-222222222222", "Template"));
    await templateLoad;
    edit.resolve(chartWidget("11111111-1111-4111-8111-111111111111", "Stale edit"));
    await editLoad;

    expect(store.form.id).toBeUndefined();
    expect(store.form.name).toBe("Template");
  });

  it("hydrates chart edit and template forms through the same adapter", async () => {
    const widget = configuredChartWidget("11111111-1111-4111-8111-111111111111", "Configured chart");
    actionMocks.getWidgetByIdAction.mockResolvedValue(widget);
    const editStore = createStore();
    const templateStore = createStore();
    setChartFilterableFields(editStore);
    setChartFilterableFields(templateStore);

    await editStore.loadById(widget.id);
    templateStore.add();
    await expect(templateStore.loadTemplate(widget.id)).resolves.toBe(true);

    expect(templateStore.form).toEqual({
      ...editStore.form,
      id: undefined,
      isTemplate: false,
    });
    expect(editStore.groupBySelectValue).toBe(`custom:${widget.groupByCustomColumnId}`);
    expect(templateStore.groupBySelectValue).toBe(editStore.groupBySelectValue);
    expect(editStore.savedState).toEqual(editStore.form);
    expect(templateStore.savedState).toEqual(templateStore.form);
    expect(editStore.hasUnsavedChanges).toBe(false);
    expect(templateStore.hasUnsavedChanges).toBe(false);
  });

  it("hydrates activity edit and template forms through the same adapter", async () => {
    const widget = activityWidget("11111111-1111-4111-8111-111111111111", "Configured activity");
    actionMocks.getWidgetByIdAction.mockResolvedValue(widget);
    const editStore = createStore();
    const templateStore = createStore();
    enableActivity(editStore);
    enableActivity(templateStore);

    await editStore.loadById(widget.id);
    templateStore.add("Recent activity");
    await expect(templateStore.loadTemplate(widget.id)).resolves.toBe(true);

    expect(templateStore.form).toEqual({
      ...editStore.form,
      id: undefined,
      isTemplate: false,
    });
    expect(editStore.groupBySelectValue).toBe(WidgetGroupByType.none);
    expect(templateStore.groupBySelectValue).toBe(WidgetGroupByType.none);
    expect(editStore.savedState).toEqual(editStore.form);
    expect(templateStore.savedState).toEqual(templateStore.form);
    expect(editStore.hasUnsavedChanges).toBe(false);
    expect(templateStore.hasUnsavedChanges).toBe(false);
  });

  it("restores every saved chart field without entity-change reactions replacing the baseline", async () => {
    const widget = configuredChartWidget("11111111-1111-4111-8111-111111111111", "Configured chart");
    actionMocks.getWidgetByIdAction.mockResolvedValue(widget);
    const store = createStore();
    setChartFilterableFields(store);

    await store.loadById(widget.id);
    const baseline = toJS(store.savedState);

    store.onChange("entityType", EntityType.organization);
    await vi.waitFor(() => expect(currentChartForm(store).entityType).toBe(EntityType.organization));
    store.resetForm();

    await vi.waitFor(() => expect(store.groupBySelectValue).toBe(`custom:${widget.groupByCustomColumnId}`));
    expect(store.form).toEqual(baseline);
    expect(store.hasUnsavedChanges).toBe(false);
  });

  it("restores the previous reaction-suppression state after nested failures", () => {
    const store = createStore();
    const internal = store as unknown as {
      skipReactions: boolean;
      withSuppressedReactions: <T>(callback: () => T) => T;
    };
    internal.skipReactions = true;

    expect(() =>
      internal.withSuppressedReactions(() => {
        throw new Error("Synthetic hydration failure");
      }),
    ).toThrow("Synthetic hydration failure");

    expect(internal.skipReactions).toBe(true);
  });

  it("discards a pending edit after the modal closes", async () => {
    const edit = deferred<ChartWidgetDto>();
    actionMocks.getWidgetByIdAction.mockReturnValueOnce(edit.promise);
    const store = createStore();

    const editLoad = store.loadById("11111111-1111-4111-8111-111111111111");
    store.close();
    edit.resolve(chartWidget("11111111-1111-4111-8111-111111111111", "Closed"));
    await editLoad;

    expect(store.isOpen).toBe(false);
    expect(store.form.id).toBeUndefined();
    expect(store.isHydrating).toBe(false);
    expect(store.isLoading).toBe(false);
  });

  it("does not overwrite a new draft with a pending edit", async () => {
    const edit = deferred<ChartWidgetDto>();
    actionMocks.getWidgetByIdAction.mockReturnValueOnce(edit.promise);
    const store = createStore();

    const editLoad = store.loadById("11111111-1111-4111-8111-111111111111");
    store.add();
    edit.resolve(chartWidget("11111111-1111-4111-8111-111111111111", "Stale edit"));
    await editLoad;

    expect(store.isOpen).toBe(true);
    expect(store.form.id).toBeUndefined();
    expect(store.form.name).toBe("");
    expect(store.isHydrating).toBe(false);
    expect(store.isLoading).toBe(false);
  });

  it("starts a guided activity draft with only the shared filter form", () => {
    const store = createStore();
    enableActivity(store);

    store.add("Recent activity");
    expect(store.creationStep).toBe("choose");

    store.startFromKind(WidgetKind.activityTimeline, "Recent activity");

    expect(store.creationStep).toBe("configure");
    expect(store.form).toMatchObject({
      kind: WidgetKind.activityTimeline,
      name: "Recent activity",
    });
    expect(store.form).not.toHaveProperty("timelineScope");
    expect(store.form).not.toHaveProperty("scopeEntityTypes");
    expect(store.hasUnsavedChanges).toBe(false);

    store.setCreationStep("choose");
    expect(store.creationStep).toBe("choose");
  });

  it("rebuilds each create kind from its canonical defaults", () => {
    const store = createStore();
    enableActivity(store);
    setChartFilterableFields(store);

    store.add("Recent activity");
    const chartDefaults = toJS(store.form);

    store.startFromKind(WidgetKind.activityTimeline, "Recent activity");
    expect(store.form).toMatchObject({
      id: undefined,
      kind: WidgetKind.activityTimeline,
      name: "Recent activity",
      displayOptions: { showFilters: true },
      isTemplate: false,
    });
    expect(store.form).not.toHaveProperty("entityType");
    expect(store.hasUnsavedChanges).toBe(false);

    store.startFromKind(WidgetKind.chart);
    expect(store.form).toEqual(chartDefaults);
    expect(store.form).not.toHaveProperty("timelineFilters");
    expect(store.hasUnsavedChanges).toBe(false);
  });

  it("keeps the accessible-record baseline implicit", () => {
    const store = createStore();
    enableActivity(store);
    store.add("Recent activity");
    store.startFromKind(WidgetKind.activityTimeline, "Recent activity");

    expect(store.form).not.toHaveProperty("timelineScope");
    expect(store.activeTimelineFilters).toEqual([]);
  });

  it("keeps a permission-hidden saved filter in preview semantics", async () => {
    const store = createStore();
    enableActivity(store);
    const hiddenFilter: ActivityWidgetDto["timelineFilters"][number] = {
      field: FilterFieldKey.provider,
      operator: FilterOperatorKey.in,
      value: ["linkedin"],
    };
    actionMocks.getWidgetByIdAction.mockResolvedValue({
      ...activityWidget("11111111-1111-4111-8111-111111111111", "Hidden provider"),
      timelineFilters: [hiddenFilter],
    });

    await store.loadById("11111111-1111-4111-8111-111111111111");

    expect(store.activeTimelineFilters).toEqual([]);
    expect(store.activeTimelineFiltersCount).toBe(0);
    expect(store.previewTimelineFilters).toEqual([hiddenFilter]);
  });

  it("keeps an existing activity widget editable and deletable after all source access is lost", async () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const { store, removeItem } = createStoreWithMocks();
    actionMocks.getWidgetByIdAction.mockResolvedValue(activityWidget(id, "Permission-lost activity"));
    actionMocks.deleteWidgetAction.mockResolvedValue({ ok: true, data: id });

    await store.loadById(id);

    expect(store.isOpen).toBe(true);
    expect(store.form).toMatchObject({ id, kind: WidgetKind.activityTimeline, name: "Permission-lost activity" });

    await expect(store.delete()).resolves.toBe(true);
    expect(removeItem).toHaveBeenCalledWith(id);
    expect(store.isOpen).toBe(false);
  });

  it("omits an incomplete activity filter like the shared filter form", async () => {
    const store = createStore();
    enableActivity(store);
    store.add("Recent activity");
    store.startFromKind(WidgetKind.activityTimeline, "Recent activity");
    store.onChange("timelineFilters[0].operator", FilterOperatorKey.in);
    actionMocks.upsertWidgetAction.mockResolvedValue({
      ok: true,
      data: activityWidget("new-widget", "Recent activity"),
    });

    await store.onSubmit();

    expect(actionMocks.upsertWidgetAction).toHaveBeenCalledWith(
      expect.objectContaining({
        timelineFilters: [],
      }),
    );
  });

  it("clears a conversation filter when its connected-account scope changes", () => {
    const store = createStore();
    enableActivity(store);
    store.add("Recent activity");
    store.startFromKind(WidgetKind.activityTimeline, "Recent activity");
    const accountIndex = activityFilterIndex(store, FilterFieldKey.connectedAccountId);
    const threadIndex = activityFilterIndex(store, FilterFieldKey.timelineThreadId);
    store.onChange(`timelineFilters[${accountIndex}].operator`, FilterOperatorKey.in);
    store.onChange(`timelineFilters[${accountIndex}].value`, ["account-1"]);
    store.onChange(`timelineFilters[${threadIndex}].operator`, FilterOperatorKey.in);
    store.onChange(`timelineFilters[${threadIndex}].value`, ["thread-1"]);

    store.onChange(`timelineFilters[${accountIndex}].value`, ["account-2"]);
    store.clearActivityThreadFilter();

    expect(store.getValue(`timelineFilters[${threadIndex}].operator`)).toBeUndefined();
    expect(store.getValue(`timelineFilters[${threadIndex}].value`)).toBeUndefined();
  });

  it("restores a saved conversation filter on reset", async () => {
    const store = createStore();
    enableActivity(store);
    actionMocks.getWidgetByIdAction.mockResolvedValue(
      activityWidgetWithConversation("11111111-1111-4111-8111-111111111111", "Recent activity"),
    );

    await store.loadById("11111111-1111-4111-8111-111111111111");

    const accountIndex = activityFilterIndex(store, FilterFieldKey.connectedAccountId);
    const threadIndex = activityFilterIndex(store, FilterFieldKey.timelineThreadId);
    expect(store.getValue(`timelineFilters[${accountIndex}].value`)).toEqual(["account-1"]);
    expect(store.getValue(`timelineFilters[${threadIndex}].value`)).toEqual(["thread-1"]);

    store.onChange(`timelineFilters[${accountIndex}].value`, ["account-2"]);
    store.clearActivityThreadFilter();
    store.resetForm();

    expect(store.getValue(`timelineFilters[${accountIndex}].value`)).toEqual(["account-1"]);
    expect(store.getValue(`timelineFilters[${threadIndex}].operator`)).toBe(FilterOperatorKey.in);
    expect(store.getValue(`timelineFilters[${threadIndex}].value`)).toEqual(["thread-1"]);
    expect(store.hasUnsavedChanges).toBe(false);
  });

  it("ignores a second submit while the first save is pending", async () => {
    const pendingSave = deferred<{ ok: true; data: ChartWidgetDto }>();
    actionMocks.upsertWidgetAction.mockReturnValue(pendingSave.promise);
    const store = createStore();
    store.add();
    store.startFromKind(WidgetKind.chart);
    store.onChange("name", "Contacts");

    const firstSubmit = store.onSubmit();
    await store.onSubmit();

    expect(actionMocks.upsertWidgetAction).toHaveBeenCalledOnce();

    pendingSave.resolve({
      ok: true,
      data: chartWidget("new-widget", "Contacts"),
    });
    await firstSubmit;
  });

  it("does not let a save from a closed session affect a new draft", async () => {
    const pendingSave = deferred<{ ok: true; data: ChartWidgetDto }>();
    actionMocks.upsertWidgetAction.mockReturnValue(pendingSave.promise);
    const { store, refresh } = createStoreWithMocks();
    store.add();
    store.startFromKind(WidgetKind.chart);
    store.onChange("name", "Old draft");

    const firstSubmit = store.onSubmit();
    store.close();
    store.add();
    store.startFromKind(WidgetKind.chart);
    store.onChange("name", "New draft");

    pendingSave.resolve({
      ok: true,
      data: chartWidget("33333333-3333-4333-8333-333333333333", "Old draft"),
    });
    await firstSubmit;

    expect(refresh).not.toHaveBeenCalled();
    expect(store.isOpen).toBe(true);
    expect(store.form.id).toBeUndefined();
    expect(store.form.name).toBe("New draft");
  });

  it("does not let a delete from a closed session affect a new draft", async () => {
    const pendingDelete = deferred<{ ok: true; data: string }>();
    actionMocks.getWidgetByIdAction.mockResolvedValue(
      chartWidget("11111111-1111-4111-8111-111111111111", "Saved widget"),
    );
    actionMocks.deleteWidgetAction.mockReturnValue(pendingDelete.promise);
    const { store, removeItem } = createStoreWithMocks();
    await store.loadById("11111111-1111-4111-8111-111111111111");

    const firstDelete = store.delete();
    await store.delete();
    store.close();
    store.add();
    store.startFromKind(WidgetKind.chart);
    store.onChange("name", "New draft");

    pendingDelete.resolve({
      ok: true,
      data: "11111111-1111-4111-8111-111111111111",
    });
    await firstDelete;

    expect(actionMocks.deleteWidgetAction).toHaveBeenCalledOnce();
    expect(removeItem).not.toHaveBeenCalled();
    expect(store.isOpen).toBe(true);
    expect(store.form.name).toBe("New draft");
  });

  it("keeps the persisted id when the post-save refresh fails", async () => {
    const saved = chartWidget("33333333-3333-4333-8333-333333333333", "Contacts");
    actionMocks.upsertWidgetAction.mockResolvedValue({ ok: true, data: saved });
    const { store, refresh } = createStoreWithMocks();
    refresh.mockRejectedValueOnce(new Error("refresh failed")).mockResolvedValueOnce(undefined);
    store.add();
    store.startFromKind(WidgetKind.chart);
    store.onChange("name", "Contacts");

    await expect(store.onSubmit()).rejects.toThrow("refresh failed");

    expect(store.form.id).toBe(saved.id);
    expect(store.savedState.id).toBe(saved.id);
    expect(store.isOpen).toBe(true);

    store.onChange("name", "Contacts updated");
    await store.onSubmit();

    expect(actionMocks.upsertWidgetAction).toHaveBeenLastCalledWith(expect.objectContaining({ id: saved.id }));
  });

  it("ignores template results from an older modal session", async () => {
    const first = deferred<{ ok: true; data: { widgets: CompanyWidget[] } }>();
    const second = deferred<{ ok: true; data: { widgets: CompanyWidget[] } }>();
    actionMocks.getCompanyWidgetsAction.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const store = createStore();

    store.add();
    store.close();
    store.add();

    second.resolve({
      ok: true,
      data: { widgets: [companyWidget("new-template", "New template")] },
    });
    await vi.waitFor(() => expect(store.companyWideWidgets.map(({ name }) => name)).toEqual(["New template"]));

    first.resolve({
      ok: true,
      data: { widgets: [companyWidget("old-template", "Old template")] },
    });
    await vi.waitFor(() => expect(actionMocks.getCompanyWidgetsAction).toHaveBeenCalledTimes(2));

    expect(store.companyWideWidgets.map(({ name }) => name)).toEqual(["New template"]);
  });

  it("advances only after an activity template is applied", async () => {
    const store = createStore();
    enableActivity(store);
    store.add("Recent activity");
    actionMocks.getWidgetByIdAction.mockResolvedValue(
      activityWidget("11111111-1111-4111-8111-111111111111", "Team activity"),
    );

    await expect(store.loadTemplate("11111111-1111-4111-8111-111111111111")).resolves.toBe(true);

    expect(store.creationStep).toBe("configure");
    expect(store.form).toMatchObject({
      id: undefined,
      kind: WidgetKind.activityTimeline,
      name: "Team activity",
      isTemplate: false,
      displayOptions: { showFilters: false },
    });
    expect(store.form).not.toHaveProperty("timelineScope");
  });

  it("retains unavailable saved filters and strips values from standalone operators", async () => {
    const { store, refresh } = createStoreWithMocks();
    enableActivity(store);
    store.add("Recent activity");
    store.startFromKind(WidgetKind.activityTimeline, "Recent activity");
    store.onChange("name", "Focused activity");
    store.onChange("timelineFilters", [
      {
        field: FilterFieldKey.timelineKind,
        operator: FilterOperatorKey.in,
        value: ["messages", "changes"],
      },
      {
        field: FilterFieldKey.provider,
        operator: FilterOperatorKey.in,
        value: ["google"],
      },
      {
        field: FilterFieldKey.connectedAccountId,
        operator: undefined,
        value: undefined,
      } as never,
      {
        field: FilterFieldKey.contactIds,
        operator: FilterOperatorKey.hasNone,
        value: ["10000000-0000-4000-8000-000000000001"],
      } as never,
    ]);
    expect(store.activeTimelineFilters).toEqual([
      {
        field: FilterFieldKey.timelineKind,
        operator: FilterOperatorKey.in,
        value: ["messages", "changes"],
      },
      {
        field: FilterFieldKey.contactIds,
        operator: FilterOperatorKey.hasNone,
        value: ["10000000-0000-4000-8000-000000000001"],
      },
    ]);
    actionMocks.upsertWidgetAction.mockResolvedValue({
      ok: true,
      data: activityWidget("new-widget", "Focused"),
    });

    await store.onSubmit();

    expect(actionMocks.upsertWidgetAction).toHaveBeenCalledWith({
      id: undefined,
      kind: WidgetKind.activityTimeline,
      name: "Focused activity",
      timelineFilters: [
        {
          field: FilterFieldKey.timelineKind,
          operator: FilterOperatorKey.in,
          value: ["messages", "changes"],
        },
        {
          field: FilterFieldKey.provider,
          operator: FilterOperatorKey.in,
          value: ["google"],
        },
        {
          field: FilterFieldKey.contactIds,
          operator: FilterOperatorKey.hasNone,
        },
      ],
      displayOptions: { showFilters: true },
      isTemplate: false,
    });
    expect(refresh).toHaveBeenCalledOnce();
    expect(store.isOpen).toBe(false);
  });

  it("keeps a requested filter section selected after edit hydration", async () => {
    const store = createStore();
    actionMocks.getWidgetByIdAction.mockResolvedValue(chartWidget("11111111-1111-4111-8111-111111111111", "Contacts"));

    store.openWithFilter("11111111-1111-4111-8111-111111111111", "filters", "status");

    await vi.waitFor(() => expect(store.form.id).toBe("11111111-1111-4111-8111-111111111111"));
    expect(store.expandedSection).toBe("filters");
    expect(store.expandedFilterField).toBe("status");
    expect(store.creationStep).toBe("configure");
  });
});
