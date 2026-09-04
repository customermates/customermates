import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { Filter, FilterableField, GetQueryParams } from "@/core/base/base-get.schema";
import type { GetResult } from "@/core/base/base-get.interactor";
import type { ReactNode } from "react";
import type { RootStore } from "@/core/stores/root.store";

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const harness = vi.hoisted(() => ({
  items: [] as { onSelect: () => void }[],
  palette: { openAt: vi.fn(), setDraftOperator: vi.fn() },
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/app/actions", () => ({
  applyDataViewOverrideAction: vi.fn(),
  selectDataViewAction: vi.fn(),
  bulkDeleteEntitiesAction: vi.fn(),
  bulkUpdateCustomFieldValuesAction: vi.fn(),
  getCustomColumnsByEntityTypeAction: vi.fn(),
  updateEntityCustomFieldValueAction: vi.fn(),
}));
vi.mock("mobx-react-lite", () => ({ observer: <T>(component: T) => component }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/core/stores/root-store.provider", () => ({ useRootStore: () => ({ filterPaletteStore: harness.palette }) }));
vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => children,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => children,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => children,
  DropdownMenuItem: ({ children, onSelect }: { children: ReactNode; onSelect: () => void }) => {
    harness.items.push({ onSelect });

    return createElement("div", { "data-menu-item": true }, children);
  },
}));

import { BaseDataViewStore } from "@/core/base/base-data-view.store";
import { ALL_VIEW_KEY, SURFACE } from "@/core/data-view/data-view-keys";
import { CustomColumnType, EntityType } from "@/generated/prisma";
import { FilterOperatorKey, ViewMode } from "@/core/base/base-query-builder";

import { FilterChipOperatorMenu } from "../filter-chip-operator-menu";

const CUSTOM_COLUMN_ID = "3f1c9a72-5d84-4a1e-9f3b-6c2d8e0a7b45";
const A_USER = "60000000-0000-4000-8000-000000000001";

const FILTERABLE_FIELDS: FilterableField[] = [
  {
    field: "userIds",
    operators: [FilterOperatorKey.in, FilterOperatorKey.notIn, FilterOperatorKey.hasSome, FilterOperatorKey.hasNone],
  },
  {
    field: "createdAt",
    operators: [
      FilterOperatorKey.gt,
      FilterOperatorKey.gte,
      FilterOperatorKey.lt,
      FilterOperatorKey.lte,
      FilterOperatorKey.between,
      FilterOperatorKey.inLastDays,
    ],
  },
];

const CUSTOM_COLUMNS = [
  { id: CUSTOM_COLUMN_ID, label: "Notes", entityType: EntityType.deal, type: CustomColumnType.plain },
] as unknown as CustomColumnDto[];

type Item = { id: string };

class TestStore extends BaseDataViewStore<Item> {
  refreshes = 0;

  get columnsDefinition() {
    return [{ uid: "name" }];
  }

  protected refreshAction(params?: GetQueryParams): Promise<GetResult<Item>> {
    this.refreshes += 1;

    return Promise.resolve(serverEcho(params));
  }
}

function serverEcho(params?: GetQueryParams): GetResult<Item> {
  return {
    items: [],
    p13nId: SURFACE.tasks,
    customColumns: CUSTOM_COLUMNS,
    filterableFields: FILTERABLE_FIELDS,
    filters: params?.filters ?? [],
    searchTerm: params?.searchTerm,
    sortDescriptor: params?.sortDescriptor,
    pagination: { page: 1, pageSize: 25, total: 1, totalPages: 1 },
    views: [],
    activeViewKey: ALL_VIEW_KEY,
    viewPersistable: false,
    viewMode: ViewMode.table,
  };
}

function hydrated(filters: Filter[]): TestStore {
  const root = {
    loadingOverlayStore: { isLoading: false },
    localeStore: { getTranslation: (key: string) => key },
  } as unknown as RootStore;
  const store = new TestStore(root);
  store.setItems(serverEcho({ filters }));

  return store;
}

function renderMenu(store: TestStore, index = 0) {
  return renderMenuFor(store, (store.filters ?? [])[index], index);
}

function renderMenuFor(store: TestStore, filter: Filter, index: number) {
  harness.items = [];
  store.refreshes = 0;

  return renderToStaticMarkup(createElement(FilterChipOperatorMenu, { store, filter, index }));
}

const userFilter = { field: "userIds", operator: FilterOperatorKey.in, value: [A_USER] } as Filter;
const createdAtFilter = { field: "createdAt", operator: FilterOperatorKey.gte, value: "2026-01-01T00:00:00" } as Filter;

describe("filter chip operator menu", () => {
  beforeEach(() => {
    harness.palette.openAt.mockClear();
    harness.palette.setDraftOperator.mockClear();
  });

  it("offers exactly the operators the surface declares for that field and marks the current one", () => {
    const store = hydrated([userFilter]);
    const markup = renderMenu(store);

    expect(harness.items).toHaveLength(4);
    for (const operator of [
      FilterOperatorKey.in,
      FilterOperatorKey.notIn,
      FilterOperatorKey.hasSome,
      FilterOperatorKey.hasNone,
    ])
      expect(markup).toContain(`Common.filters.operators.${operator}`);

    expect(markup).not.toContain("Common.filters.operators.contains");
    expect(markup.split("lucide-check").length - 1).toBe(1);
  });

  it("renders the trigger as a real button so it can nest inside an inert chip", () => {
    const store = hydrated([userFilter]);
    const markup = renderMenu(store);

    expect(markup).toContain("<button");
    expect(markup).toContain('type="button"');
    expect(markup).toContain("data-palette-operator-trigger");
    expect(markup).toContain("Common.filters.palette.editOperator");
  });

  it("keeps a value the next operator can still carry and commits it once", () => {
    const store = hydrated([userFilter]);
    renderMenu(store);

    harness.items[1].onSelect();

    expect(store.filters).toEqual([{ field: "userIds", operator: FilterOperatorKey.notIn, value: [A_USER] }]);
    expect(store.refreshes).toBe(1);
    expect(harness.palette.openAt).not.toHaveBeenCalled();
  });

  it("writes a relation-existence operator with no value key at all", () => {
    const store = hydrated([userFilter]);
    renderMenu(store);

    harness.items[3].onSelect();

    const committed = (store.filters ?? [])[0];

    expect(committed).toEqual({ field: "userIds", operator: FilterOperatorKey.hasNone });
    expect("value" in committed).toBe(false);
    expect(store.refreshes).toBe(1);
  });

  it("sends an incompatible operator change to the palette rather than committing a half filter", () => {
    const store = hydrated([createdAtFilter]);
    renderMenu(store);

    harness.items[4].onSelect();

    expect(store.refreshes).toBe(0);
    expect(store.filters).toEqual([createdAtFilter]);
    expect(harness.palette.openAt).toHaveBeenCalledWith(store, {
      kind: "value",
      field: "createdAt",
      editIndex: 0,
    });
    expect(harness.palette.setDraftOperator).toHaveBeenCalledWith(FilterOperatorKey.between);
  });

  it("does nothing when the operator already in force is chosen again", () => {
    const store = hydrated([userFilter]);
    renderMenu(store);

    harness.items[0].onSelect();

    expect(store.refreshes).toBe(0);
    expect(store.filters).toEqual([userFilter]);
    expect(harness.palette.openAt).not.toHaveBeenCalled();
  });

  it("offers no operator to choose for a field the surface no longer declares", () => {
    const store = hydrated([userFilter]);
    const orphan = { field: CUSTOM_COLUMN_ID, operator: FilterOperatorKey.contains, value: "x" } as Filter;
    const markup = renderMenuFor(store, orphan, 0);

    expect(harness.items).toHaveLength(0);
    expect(markup).toContain("disabled");
  });
});
