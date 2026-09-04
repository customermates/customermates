import type { GetResult } from "../base-get.interactor";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { Filter, FilterableField, GetQueryParams } from "../base-get.schema";
import type { RootStore } from "@/core/stores/root.store";

import { describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/app/actions", () => ({
  applyDataViewOverrideAction: vi.fn(),
  selectDataViewAction: vi.fn(),
  bulkDeleteEntitiesAction: vi.fn(),
  bulkUpdateCustomFieldValuesAction: vi.fn(),
  getCustomColumnsByEntityTypeAction: vi.fn(),
  updateEntityCustomFieldValueAction: vi.fn(),
}));

import { BaseDataViewStore } from "../base-data-view.store";
import { BaseQueryBuilder, defaultValidateFilters, FilterOperatorKey, ViewMode } from "../base-query-builder";
import { CustomColumnType, EntityType } from "@/generated/prisma";
import { decodeGetParams, encodeGetParams } from "@/core/utils/get-params";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { SURFACE, ALL_VIEW_KEY } from "@/core/data-view/data-view-keys";

type Item = { id: string };

const CUSTOM_COLUMN_ID = "3f1c9a72-5d84-4a1e-9f3b-6c2d8e0a7b45";

const FILTERABLE_FIELDS: FilterableField[] = [
  { field: FilterFieldKey.status, operators: [FilterOperatorKey.in, FilterOperatorKey.notIn] },
  { field: FilterFieldKey.userIds, operators: [FilterOperatorKey.in, FilterOperatorKey.notIn] },
  { field: CUSTOM_COLUMN_ID, operators: [FilterOperatorKey.contains, FilterOperatorKey.equals] },
];

const CUSTOM_COLUMNS = [
  { id: CUSTOM_COLUMN_ID, label: "Notes", entityType: EntityType.deal, type: CustomColumnType.plain },
] as unknown as CustomColumnDto[];

const statusFilter = (value: string): Filter =>
  ({ field: FilterFieldKey.status, operator: FilterOperatorKey.in, value: [value] }) as Filter;

class TestQueryBuilder extends BaseQueryBuilder<Record<string, unknown>> {
  override getFilterableFields(): Promise<FilterableField[]> {
    return Promise.resolve(FILTERABLE_FIELDS);
  }

  override getCustomColumns(): Promise<CustomColumnDto[]> {
    return Promise.resolve(CUSTOM_COLUMNS);
  }
}

class TestStore extends BaseDataViewStore<Item> {
  get columnsDefinition() {
    return [{ uid: "name" }, { uid: "status" }];
  }

  protected refreshAction(params?: GetQueryParams): Promise<GetResult<Item>> {
    return Promise.resolve(serverEcho(params));
  }
}

function serverEcho(params?: GetQueryParams): GetResult<Item> {
  return {
    items: [],
    p13nId: SURFACE.tasks,
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

function hydrated(filters: Filter[] = []): TestStore {
  const root = {
    loadingOverlayStore: { isLoading: false },
    localeStore: { getTranslation: (key: string) => key },
  } as unknown as RootStore;
  const store = new TestStore(root);
  store.setItems(serverEcho({ filters }));

  return store;
}

const andEntries = (where: Record<string, unknown>) => (where.AND ?? []) as Record<string, unknown>[];

describe("two filters on one field", () => {
  it("survives server validation as two separate candidates", () => {
    const filters = [statusFilter("open"), statusFilter("won")];

    expect(defaultValidateFilters({ filters, filterableFields: FILTERABLE_FIELDS })).toEqual(filters);
  });

  it("becomes two separate AND clauses on a scalar field", async () => {
    const { where } = await new TestQueryBuilder().buildQueryArgs({
      filters: [statusFilter("open"), statusFilter("won")],
    });

    expect(andEntries(where)).toEqual([{ status: { in: ["open"] } }, { status: { in: ["won"] } }]);
  });

  it("becomes two separate AND clauses on a relation field", async () => {
    const { where } = await new TestQueryBuilder().buildQueryArgs({
      filters: [
        { field: FilterFieldKey.userIds, operator: FilterOperatorKey.in, value: ["u1"] } as Filter,
        { field: FilterFieldKey.userIds, operator: FilterOperatorKey.in, value: ["u2"] } as Filter,
      ],
    });

    expect(andEntries(where)).toHaveLength(2);
    expect(andEntries(where)).toEqual([
      { users: { some: { userId: { in: ["u1"] } } } },
      { users: { some: { userId: { in: ["u2"] } } } },
    ]);
  });

  it("becomes two separate AND clauses on a custom column", async () => {
    const { where } = await new TestQueryBuilder().buildQueryArgs({
      filters: [
        { field: CUSTOM_COLUMN_ID, operator: FilterOperatorKey.contains, value: "acme" } as Filter,
        { field: CUSTOM_COLUMN_ID, operator: FilterOperatorKey.contains, value: "corp" } as Filter,
      ],
    });

    expect(andEntries(where)).toHaveLength(2);
    expect(JSON.stringify(andEntries(where)[0])).toContain("acme");
    expect(JSON.stringify(andEntries(where)[1])).toContain("corp");
  });

  it("round-trips through the URL in order", () => {
    const filters = [statusFilter("open"), statusFilter("won")];
    const encoded = encodeGetParams({ filters });

    expect(encoded.getAll("filters")).toEqual(["status:in:open", "status:in:won"]);
    expect(decodeGetParams(encoded).filters).toEqual(filters);
  });
});

describe("index addressed filter actions", () => {
  it("appends rather than merging by field", () => {
    const store = hydrated([statusFilter("open")]);

    store.appendFilter(statusFilter("won"));

    expect(store.filters).toEqual([statusFilter("open"), statusFilter("won")]);
  });

  it("removes one row and leaves its sibling on the same field in place", () => {
    const store = hydrated([statusFilter("open"), statusFilter("won")]);

    store.removeFilterAt(0);

    expect(store.filters).toEqual([statusFilter("won")]);
  });

  it("replaces in place without disturbing the order", () => {
    const store = hydrated([statusFilter("open"), statusFilter("won")]);

    store.replaceFilterAt(0, statusFilter("lost"));

    expect(store.filters).toEqual([statusFilter("lost"), statusFilter("won")]);
  });

  it("ignores an index that no longer exists", () => {
    const store = hydrated([statusFilter("open")]);

    store.removeFilterAt(4);
    store.replaceFilterAt(-1, statusFilter("won"));

    expect(store.filters).toEqual([statusFilter("open")]);
  });

  it("offers no field-keyed removal that would drop every sibling", () => {
    const store = hydrated([statusFilter("open")]);

    expect("removeFilter" in store).toBe(false);
  });
});
