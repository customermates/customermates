import type { Filter, FilterableField, GetQueryParams, SortDescriptor } from "@/core/base/base-get.schema";
import type { SearchableField, SortableField } from "@/core/base/base-query-builder";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockUser } from "@/tests/helpers/mock-user";
import {
  MOCK_ENV_MODULE,
  MOCK_PRISMA_DB_MODULE,
  MOCK_ZOD_MODULE,
  createMockDiModule,
} from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);

import type { ActivityEntryDto, ActivitiesParams, ActivityKind } from "../activities.schema";
import type { ActivityScope } from "../activity-scope.schema";

import { runWithTenant } from "@/core/decorators/tenant-context";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { FilterOperatorKey } from "@/core/base/base-query-builder";
import { GetActivitiesInteractor, GetActivitiesRepo } from "../get-activities.interactor";

class MockActivitiesRepo extends GetActivitiesRepo {
  auditAvailable = true;
  messagingAllowed = true;
  messagingEnabled = false;
  total = 0;

  sumNumericFields<F extends string>(): Promise<Partial<Record<F, number | null>>> {
    return Promise.resolve({});
  }

  canReadMessagingSources(): boolean {
    return this.messagingAllowed;
  }

  getAvailableSources(): ActivityKind[] {
    return [
      ...(this.auditAvailable ? (["audit"] as const) : []),
      ...(this.messagingEnabled ? (["message", "activity", "calendar_event"] as const) : []),
    ];
  }

  isScopeTruncated(): Promise<boolean> {
    return Promise.resolve(false);
  }

  setMessagingSourcesEnabled(enabled: boolean): void {
    this.messagingEnabled = enabled;
  }

  setScope(_scope?: ActivityScope): void {}

  getItems(_params: GetQueryParams): Promise<ActivityEntryDto[]> {
    return Promise.resolve([]);
  }

  getCount(_params: GetQueryParams): Promise<number> {
    return Promise.resolve(this.total);
  }

  getSortableFields(): SortableField[] {
    return [{ field: "at", resolvedFields: ["at"] }];
  }

  getSearchableFields(): SearchableField[] {
    return [];
  }

  getFilterableFields(): Promise<FilterableField[]> {
    return Promise.resolve([]);
  }

  getCustomColumns(): Promise<CustomColumnDto[]> {
    return Promise.resolve([]);
  }

  validateFilters({ filters }: { filters: Filter[] | undefined }): Filter[] {
    return filters ?? [];
  }

  validateSortDescriptor({
    sortDescriptor,
  }: {
    sortDescriptor: SortDescriptor | undefined;
  }): SortDescriptor | undefined {
    return sortDescriptor;
  }
}

const A_TIMELINE_VIEW = {
  id: "7d2c1b90-4a3e-4f51-8c62-0a1b2c3d4e5f",
  name: "Emails only",
  visibility: "private" as const,
  position: 0,
  isOwner: true,
  ownerName: "Max Mustermann",
  state: {},
};

function makeInteractor(repo: MockActivitiesRepo, denied = false, surfaceViews = [] as (typeof A_TIMELINE_VIEW)[]) {
  return new GetActivitiesInteractor(
    repo,
    {
      loadSurfaceState: vi.fn().mockResolvedValue({ activeViewKey: null, views: surfaceViews, overrides: new Map() }),
    },
    "interactive",
    {} as never,
    {
      require: vi.fn().mockResolvedValue(denied ? { ok: false } : null),
    } as never,
  );
}

function makeApiInteractor(repo: MockActivitiesRepo, precheck: { invoke: ReturnType<typeof vi.fn> }) {
  return new GetActivitiesInteractor(
    repo,
    { loadSurfaceState: vi.fn().mockResolvedValue({ activeViewKey: null, views: [], overrides: new Map() }) },
    "api",
    precheck as never,
    { require: vi.fn().mockResolvedValue({ ok: false }) } as never,
  );
}

async function invoke(repo: MockActivitiesRepo, denied = false, page = 1, pageSize: 25 | 100 = 25) {
  return runWithTenant(mockUser, () => makeInteractor(repo, denied).invoke({ pagination: { page, pageSize } }));
}

describe("GetActivitiesInteractor", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reports audit and messaging source availability when both are enabled", async () => {
    const result = await invoke(new MockActivitiesRepo());

    expect(result.ok && result.data.availableSources).toEqual(["audit", "message", "activity", "calendar_event"]);
  });

  it("keeps audit available when messaging entitlement is denied", async () => {
    const result = await invoke(new MockActivitiesRepo(), true);

    expect(result.ok && result.data.availableSources).toEqual(["audit"]);
  });

  it("reports no sources when neither audit nor messaging is available", async () => {
    const repo = new MockActivitiesRepo();
    repo.auditAvailable = false;
    repo.messagingAllowed = false;

    const result = await invoke(repo);

    expect(result.ok && result.data.availableSources).toEqual([]);
  });

  it("keeps the data view fields on the interactive timeline output instead of validating them away", async () => {
    const result = await runWithTenant(mockUser, () =>
      makeInteractor(new MockActivitiesRepo(), false, [A_TIMELINE_VIEW]).invoke({
        p13nId: "entity-timeline",
        pagination: { page: 1, pageSize: 25 },
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.views).toEqual([A_TIMELINE_VIEW]);
    expect(result.data.activeViewKey).toBe("__all__");
    expect(result.data.viewIsDirty).toBe(false);
    expect(result.data.viewCanShare).toBe(false);
    expect(result.data.viewPersistable).toBe(true);
    expect(result.data.viewUnavailable).toBe(false);
  });

  it("keeps the full known filter contract in API precheck after messaging permission loss", async () => {
    const repo = new MockActivitiesRepo();
    repo.messagingAllowed = false;
    const precheck = { invoke: vi.fn() };
    const filters: NonNullable<ActivitiesParams["filters"]> = [
      {
        field: FilterFieldKey.connectedAccountId,
        operator: FilterOperatorKey.in,
        value: ["16000000-0000-4000-8000-000000000001"],
      },
    ];

    const result = await runWithTenant(mockUser, () => makeApiInteractor(repo, precheck).invoke({ filters }));

    expect(result.ok).toBe(true);
    const precheckFields = precheck.invoke.mock.calls[0]?.[0].filterableFields as FilterableField[];
    expect(precheckFields.map((field) => field.field)).toEqual(
      expect.arrayContaining([
        FilterFieldKey.timelineThreadId,
        FilterFieldKey.provider,
        FilterFieldKey.connectedAccountId,
        FilterFieldKey.contactIds,
        FilterFieldKey.organizationIds,
        FilterFieldKey.dealIds,
        FilterFieldKey.serviceIds,
        FilterFieldKey.taskIds,
      ]),
    );
    expect(result.ok && result.data.filterableFields).toEqual([]);
  });

  it.each([
    [39, 1_001, false],
    [40, 1_000, false],
    [40, 1_001, true],
  ] as const)("signals the page cap for page %s with total %s", async (page, total, expected) => {
    const repo = new MockActivitiesRepo();
    repo.total = total;

    const result = await invoke(repo, false, page);

    expect(result.ok && result.data.pageLimitReached).toBe(expected);
    expect(result.ok && result.data.pagination?.totalPages).toBe(40);
  });
});
