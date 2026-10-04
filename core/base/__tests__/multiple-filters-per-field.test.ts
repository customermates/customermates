import { TestQueryBuilder } from "./fixtures/multiple-filters-per-field-test-query-builder";
import type { CustomColumnDto } from "@/core/data-view/column-presentation.schema";
import type { RootStore } from "@/core/stores/root.store";
import type { GetResult } from "../base-get.interactor";
import type { Filter, FilterableField, GetQueryParams } from "../base-get.schema";

import { describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/app/actions", () => ({
  saveDataViewStateAction: vi.fn(),
  selectDataViewAction: vi.fn(),
  bulkDeleteEntitiesAction: vi.fn(),
  bulkUpdateCustomFieldValuesAction: vi.fn(),
  getCustomColumnsByEntityTypeAction: vi.fn(),
  updateEntityCustomFieldValueAction: vi.fn(),
}));

import { ALL_VIEW_KEY, SURFACE } from "@/core/data-view/data-view-keys";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { decodeGetParams, encodeGetParams } from "@/core/utils/get-params";
import { CustomColumnType } from "@/core/data-view/column-presentation.types";
import { EntityType } from "@/features/records/history/v1/legacy-enums";
import { BaseDataViewStore } from "../base-data-view.store";
import { defaultValidateFilters, FilterOperatorKey, ViewMode } from "../base-query-builder";

type Item = { id: string };

const CUSTOM_COLUMN_ID = "3f1c9a72-5d84-4a1e-9f3b-6c2d8e0a7b45";

const FILTERABLE_FIELDS: FilterableField[] = [
  {
    field: FilterFieldKey.status,
    operators: [FilterOperatorKey.in, FilterOperatorKey.notIn],
  },
  {
    field: FilterFieldKey.userIds,
    operators: [FilterOperatorKey.in, FilterOperatorKey.notIn],
  },
  {
    field: CUSTOM_COLUMN_ID,
    operators: [FilterOperatorKey.contains, FilterOperatorKey.equals],
  },
];

const CUSTOM_COLUMNS = [
  {
    id: CUSTOM_COLUMN_ID,
    label: "Notes",
    entityType: EntityType.deal,
    type: CustomColumnType.plain,
  },
] as unknown as CustomColumnDto[];

TestQueryBuilder.filterableFields = FILTERABLE_FIELDS;
TestQueryBuilder.customColumns = CUSTOM_COLUMNS;

const statusFilter = (value: string): Filter =>
  ({
    field: FilterFieldKey.status,
    operator: FilterOperatorKey.in,
    value: [value],
  }) as Filter;

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
        {
          field: FilterFieldKey.userIds,
          operator: FilterOperatorKey.in,
          value: ["u1"],
        } as Filter,
        {
          field: FilterFieldKey.userIds,
          operator: FilterOperatorKey.in,
          value: ["u2"],
        } as Filter,
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
        {
          field: CUSTOM_COLUMN_ID,
          operator: FilterOperatorKey.contains,
          value: "acme",
        } as Filter,
        {
          field: CUSTOM_COLUMN_ID,
          operator: FilterOperatorKey.contains,
          value: "corp",
        } as Filter,
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
