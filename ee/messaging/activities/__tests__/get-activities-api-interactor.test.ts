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
const getActiveUserOrThrow = vi.hoisted(() => vi.fn());

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => ({
  ...createMockDiModule(() => mockUser),
  getUserService: () => ({ getActiveUserOrThrow }),
}));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);

import type { ActivityEntryDto, ActivityKind } from "../activities.schema";
import type { ActivityScope } from "../activity-scope.schema";

import { FilterOperatorKey } from "@/core/base/base-query-builder";
import { FilterFieldKey } from "@/core/types/filter-field-key";

import { ActivitiesApiParamsSchema } from "../activities.schema";
import { GetActivitiesInteractor, GetActivitiesRepo } from "../get-activities.interactor";

class MockActivitiesRepo extends GetActivitiesRepo {
  canReadMessagingSources(): boolean {
    return true;
  }

  getAvailableSources(): ActivityKind[] {
    return ["audit"];
  }

  isScopeTruncated(): Promise<boolean> {
    return Promise.resolve(false);
  }

  setMessagingSourcesEnabled(_enabled: boolean): void {}

  setScope(_scope?: ActivityScope): void {}

  getItems(_params: GetQueryParams): Promise<ActivityEntryDto[]> {
    return Promise.resolve([]);
  }

  getCount(_params: GetQueryParams): Promise<number> {
    return Promise.resolve(0);
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

function makeApiInteractor(p13n: { getP13n: ReturnType<typeof vi.fn>; upsertP13n: ReturnType<typeof vi.fn> }) {
  return new GetActivitiesInteractor(
    new MockActivitiesRepo(),
    p13n as never,
    "api",
    { invoke: vi.fn() } as never,
    {
      require: vi.fn().mockResolvedValue(null),
    } as never,
  );
}

describe("activity search API interactor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getActiveUserOrThrow.mockResolvedValue(mockUser);
  });

  it("resolves the active user exactly once per request", async () => {
    const result = await makeApiInteractor({ getP13n: vi.fn(), upsertP13n: vi.fn() }).invoke({});

    expect(result.ok).toBe(true);
    expect(getActiveUserOrThrow).toHaveBeenCalledTimes(1);
  });

  it("ignores the interactive-only p13nId like every sibling API endpoint", async () => {
    const p13n = { getP13n: vi.fn(), upsertP13n: vi.fn() };

    const result = await makeApiInteractor(p13n).invoke({ p13nId: "dashboard" });

    expect(result.ok).toBe(true);
    expect(p13n.getP13n).not.toHaveBeenCalled();
    expect(p13n.upsertP13n).not.toHaveBeenCalled();
  });
});

describe("activity search documented API schema", () => {
  it("rejects unknown request fields", () => {
    expect(ActivitiesApiParamsSchema.safeParse({ unexpected: true }).success).toBe(false);
  });

  it("rejects a relationship filter whose membership operator carries no value", () => {
    const parsed = ActivitiesApiParamsSchema.safeParse({
      filters: [{ field: FilterFieldKey.contactIds, operator: FilterOperatorKey.in, value: [] }],
    });

    expect(parsed.success).toBe(false);
  });

  it("keeps the interactive-only p13nId out of the documented contract", () => {
    expect(ActivitiesApiParamsSchema.safeParse({ p13nId: "dashboard" }).success).toBe(false);
  });

  it("accepts a well-formed request", () => {
    const parsed = ActivitiesApiParamsSchema.safeParse({
      filters: [{ field: FilterFieldKey.contactIds, operator: FilterOperatorKey.hasSome }],
      pagination: { page: 1, pageSize: 25 },
    });

    expect(parsed.success).toBe(true);
  });
});
