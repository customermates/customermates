import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockUser } from "@/tests/helpers/mock-user";
import {
  MOCK_ENV_MODULE,
  MOCK_PRISMA_DB_MODULE,
  MOCK_ZOD_MODULE,
  createMockDiModule,
} from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();
const { widgetFindIds } = vi.hoisted(() => ({ widgetFindIds: vi.fn() }));

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => ({
  ...createMockDiModule(() => mockUser),
  getWidgetRepo: () => ({ findIds: widgetFindIds }),
}));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);

import type { ActivityWidgetDto, ChartWidgetDto } from "../widget.schema";
import type { UpsertWidgetData } from "../upsert-widget.interactor";

import { WidgetKind } from "@/generated/prisma";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { FilterOperatorKey } from "@/core/base/base-query-builder";
import { QueryParamsPrecheckInteractor } from "@/core/base/query-params-precheck.interactor";

import { getCustomColumnRepo, getWidgetRepo } from "@/core/di";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { ValidateCustomColumnIdsInteractor } from "@/core/validation/validators/validate-custom-column-ids.interactor";
import { ValidateWidgetIdsInteractor } from "@/core/validation/validators/validate-widget-ids.interactor";
import { UpsertWidgetInteractor, UpsertWidgetRepo } from "../upsert-widget.interactor";

const WIDGET_ID = "00000000-0000-4000-8000-000000000001";
const STALE_CONTACT_ID = "16000000-0000-4000-8000-000000000001";
const NEW_INACCESSIBLE_CONTACT_ID = "16000000-0000-4000-8000-000000000002";
const NEW_ACCESSIBLE_CONTACT_ID = "16000000-0000-4000-8000-000000000003";

function activityDto(data: Extract<UpsertWidgetData, { kind: typeof WidgetKind.activityTimeline }>): ActivityWidgetDto {
  return {
    id: data.id ?? WIDGET_ID,
    userId: mockUser.id,
    companyId: mockUser.companyId,
    kind: WidgetKind.activityTimeline,
    name: data.name,
    timelineFilters: data.timelineFilters ?? [],
    displayOptions: data.displayOptions ?? null,
    layout: null,
    isTemplate: data.isTemplate,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}

function chartDto(data: Extract<UpsertWidgetData, { kind: typeof WidgetKind.chart }>): ChartWidgetDto {
  return {
    id: data.id ?? WIDGET_ID,
    userId: mockUser.id,
    companyId: mockUser.companyId,
    kind: WidgetKind.chart,
    name: data.name,
    entityType: data.entityType,
    entityFilters: data.entityFilters ?? [],
    dealFilters: data.dealFilters ?? [],
    displayOptions: data.displayOptions ?? null,
    groupByType: data.groupByType,
    groupByCustomColumnId: data.groupByCustomColumnId ?? null,
    aggregationType: data.aggregationType,
    data: [],
    layout: null,
    isTemplate: data.isTemplate,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}

class MockUpsertWidgetRepo extends UpsertWidgetRepo {
  canReadMessagingSources = vi.fn(() => true);
  getActivityFilterableFields = vi.fn(() =>
    Promise.resolve([
      {
        field: FilterFieldKey.timelineKind,
        operators: [FilterOperatorKey.in, FilterOperatorKey.notIn],
      },
    ]),
  );
  getWidgetKind = vi.fn<(id: string) => Promise<WidgetKind | null>>();
  getWidgetById = vi.fn<(id: string) => Promise<ActivityWidgetDto | ChartWidgetDto | null>>();
  setMessagingSourcesEnabled = vi.fn();
  upsertWidget = vi.fn(({ data }: { data: UpsertWidgetData }) => {
    return Promise.resolve(data.kind === WidgetKind.activityTimeline ? activityDto(data) : chartDto(data));
  });
}

function makeInteractor(repo: MockUpsertWidgetRepo, entitlementDenied = false) {
  const queryParamsPrecheck = {
    invoke: vi.fn(
      (
        fields: {
          filterableFields: Array<{ field: string; operators: string[] }>;
        },
        _entityType: unknown,
        data: { filters?: Array<{ field: string; operator: string }> },
        ctx: { addIssue: (issue: unknown) => void },
      ) => {
        for (const [index, filter] of (data.filters ?? []).entries()) {
          const field = fields.filterableFields.find((candidate) => candidate.field === filter.field);
          if (!field) {
            ctx.addIssue({
              code: "custom",
              params: { error: CustomErrorCode.invalidFilterField },
              path: ["filters", index, "field"],
            });
          } else if (!field.operators.includes(filter.operator)) {
            ctx.addIssue({
              code: "custom",
              params: { error: CustomErrorCode.invalidFilterOperator },
              path: ["filters", index, "operator"],
            });
          }
        }
      },
    ),
  };

  return new UpsertWidgetInteractor(
    repo,
    new ValidateWidgetIdsInteractor(getWidgetRepo()),
    new ValidateCustomColumnIdsInteractor(getCustomColumnRepo()),
    queryParamsPrecheck as never,
    {
      require: vi.fn().mockResolvedValue(entitlementDenied ? { ok: false } : null),
    } as never,
  );
}

function makeRelationshipInteractor(repo: MockUpsertWidgetRepo) {
  const unusedValidator = { invoke: vi.fn().mockResolvedValue(undefined) };
  const contactValidator = {
    invoke: vi.fn(
      (requests: Array<{ ids: string[]; path: PropertyKey[] }>, ctx: { addIssue: (issue: unknown) => void }) => {
        for (const request of requests) {
          if (request.ids.includes(NEW_INACCESSIBLE_CONTACT_ID)) {
            ctx.addIssue({
              code: "custom",
              params: { error: CustomErrorCode.contactNotFound },
              path: request.path,
            });
          }
        }
        return Promise.resolve();
      },
    ),
  };
  const queryParamsPrecheck = new QueryParamsPrecheckInteractor(
    unusedValidator as never,
    contactValidator as never,
    unusedValidator as never,
    unusedValidator as never,
    unusedValidator as never,
    unusedValidator as never,
    unusedValidator as never,
    unusedValidator as never,
    {} as never,
  );

  return {
    contactValidator,
    interactor: new UpsertWidgetInteractor(
      repo,
      new ValidateWidgetIdsInteractor(getWidgetRepo()),
      new ValidateCustomColumnIdsInteractor(getCustomColumnRepo()),
      queryParamsPrecheck,
      { require: vi.fn().mockResolvedValue(null) } as never,
    ),
  };
}

function contactMembershipFilter(...ids: string[]): ActivityWidgetDto["timelineFilters"][number] {
  return {
    field: FilterFieldKey.contactIds,
    operator: FilterOperatorKey.in,
    value: ids,
  };
}

function enableContactFilters(repo: MockUpsertWidgetRepo) {
  repo.getActivityFilterableFields.mockResolvedValue([
    {
      field: FilterFieldKey.contactIds,
      operators: [FilterOperatorKey.in, FilterOperatorKey.notIn, FilterOperatorKey.hasSome, FilterOperatorKey.hasNone],
    },
  ]);
}

function activityInput(id?: string): Extract<UpsertWidgetData, { kind: typeof WidgetKind.activityTimeline }> {
  return {
    id,
    kind: WidgetKind.activityTimeline,
    name: "Recent activity",
    timelineFilters: [],
    displayOptions: { showFilters: true },
    isTemplate: false,
  };
}

describe("UpsertWidgetInteractor", () => {
  let repo: MockUpsertWidgetRepo;

  beforeEach(() => {
    vi.clearAllMocks();
    repo = new MockUpsertWidgetRepo();
  });

  it("creates an activity timeline widget", async () => {
    const input = activityInput();
    const result = await makeInteractor(repo).invoke(input);

    expect(result.ok).toBe(true);
    expect(repo.upsertWidget).toHaveBeenCalledWith({ data: input });
  });

  it("updates a widget without changing its kind", async () => {
    widgetFindIds.mockResolvedValue(new Set([WIDGET_ID]));
    repo.getWidgetKind.mockResolvedValue(WidgetKind.activityTimeline);

    const result = await makeInteractor(repo).invoke(activityInput(WIDGET_ID));

    expect(result.ok).toBe(true);
    expect(repo.upsertWidget).toHaveBeenCalledOnce();
  });

  it("preserves activity filters when an update omits them", async () => {
    widgetFindIds.mockResolvedValue(new Set([WIDGET_ID]));
    repo.getWidgetKind.mockResolvedValue(WidgetKind.activityTimeline);
    const input = activityInput(WIDGET_ID);
    delete input.timelineFilters;

    const result = await makeInteractor(repo).invoke(input);

    expect(result.ok).toBe(true);
    expect(repo.upsertWidget).toHaveBeenCalledWith({ data: input });
    expect(repo.getActivityFilterableFields).toHaveBeenCalledOnce();
  });

  it("allows a metadata-only activity update after all activity source access is lost", async () => {
    widgetFindIds.mockResolvedValue(new Set([WIDGET_ID]));
    repo.getWidgetKind.mockResolvedValue(WidgetKind.activityTimeline);
    repo.getActivityFilterableFields.mockResolvedValue([]);
    const input = activityInput(WIDGET_ID);
    delete input.timelineFilters;

    const result = await makeInteractor(repo).invoke(input);

    expect(result.ok).toBe(true);
    expect(repo.upsertWidget).toHaveBeenCalledWith({ data: input });
  });

  it("allows activity filters to be cleared after all activity source access is lost", async () => {
    widgetFindIds.mockResolvedValue(new Set([WIDGET_ID]));
    repo.getWidgetKind.mockResolvedValue(WidgetKind.activityTimeline);
    repo.getActivityFilterableFields.mockResolvedValue([]);
    const input = activityInput(WIDGET_ID);
    input.timelineFilters = [];

    const result = await makeInteractor(repo).invoke(input);

    expect(result.ok).toBe(true);
    expect(repo.upsertWidget).toHaveBeenCalledWith({ data: input });
  });

  it("rejects changing a stored activity kind after all activity source access is lost", async () => {
    widgetFindIds.mockResolvedValue(new Set([WIDGET_ID]));
    repo.getWidgetKind.mockResolvedValue(WidgetKind.activityTimeline);
    repo.getActivityFilterableFields.mockResolvedValue([]);
    const existing = activityDto(activityInput(WIDGET_ID));
    existing.timelineFilters = [
      {
        field: FilterFieldKey.timelineKind,
        operator: FilterOperatorKey.in,
        value: ["audit"],
      },
    ];
    repo.getWidgetById.mockResolvedValue(existing);
    const input = activityInput(WIDGET_ID);
    input.timelineFilters = [
      {
        field: FilterFieldKey.timelineKind,
        operator: FilterOperatorKey.in,
        value: ["messages"],
      },
    ];

    const result = await makeInteractor(repo).invoke(input);

    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).toContain(CustomErrorCode.invalidFilterValue);
    expect(repo.upsertWidget).not.toHaveBeenCalled();
  });

  it("rejects adding a relationship ID after all activity source access is lost", async () => {
    widgetFindIds.mockResolvedValue(new Set([WIDGET_ID]));
    repo.getWidgetKind.mockResolvedValue(WidgetKind.activityTimeline);
    repo.getActivityFilterableFields.mockResolvedValue([]);
    const existing = activityDto(activityInput(WIDGET_ID));
    existing.timelineFilters = [contactMembershipFilter(STALE_CONTACT_ID)];
    repo.getWidgetById.mockResolvedValue(existing);
    const input = activityInput(WIDGET_ID);
    input.timelineFilters = [contactMembershipFilter(STALE_CONTACT_ID, NEW_ACCESSIBLE_CONTACT_ID)];

    const result = await makeRelationshipInteractor(repo).interactor.invoke(input);

    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).toContain(CustomErrorCode.invalidFilterValue);
    expect(repo.upsertWidget).not.toHaveBeenCalled();
  });

  it("allows an unavailable saved filter to be retained or removed during update", async () => {
    widgetFindIds.mockResolvedValue(new Set([WIDGET_ID]));
    repo.getWidgetKind.mockResolvedValue(WidgetKind.activityTimeline);
    const unavailableFilter: ActivityWidgetDto["timelineFilters"][number] = {
      field: FilterFieldKey.provider,
      operator: FilterOperatorKey.in,
      value: ["google"],
    };
    const existing = activityDto(activityInput(WIDGET_ID));
    existing.timelineFilters = [unavailableFilter];
    repo.getWidgetById.mockResolvedValue(existing);
    const retained = activityInput(WIDGET_ID);
    retained.timelineFilters = [unavailableFilter];

    expect((await makeInteractor(repo).invoke(retained)).ok).toBe(true);

    const removed = activityInput(WIDGET_ID);
    removed.timelineFilters = [];
    expect((await makeInteractor(repo).invoke(removed)).ok).toBe(true);
  });

  it("rejects a newly inaccessible relationship ID when creating an activity widget", async () => {
    enableContactFilters(repo);
    const input = activityInput();
    input.timelineFilters = [contactMembershipFilter(NEW_INACCESSIBLE_CONTACT_ID)];

    const result = await makeRelationshipInteractor(repo).interactor.invoke(input);

    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).toContain(CustomErrorCode.contactNotFound);
    expect(repo.upsertWidget).not.toHaveBeenCalled();
  });

  it("retains an already stored inaccessible relationship ID during update", async () => {
    enableContactFilters(repo);
    widgetFindIds.mockResolvedValue(new Set([WIDGET_ID]));
    repo.getWidgetKind.mockResolvedValue(WidgetKind.activityTimeline);
    const existing = activityDto(activityInput(WIDGET_ID));
    existing.timelineFilters = [contactMembershipFilter(STALE_CONTACT_ID)];
    repo.getWidgetById.mockResolvedValue(existing);
    const input = activityInput(WIDGET_ID);
    input.timelineFilters = [contactMembershipFilter(STALE_CONTACT_ID)];
    const { contactValidator, interactor } = makeRelationshipInteractor(repo);

    const result = await interactor.invoke(input);

    expect(result.ok).toBe(true);
    expect(contactValidator.invoke).not.toHaveBeenCalled();
    expect(repo.upsertWidget).toHaveBeenCalledWith({ data: input });
  });

  it("removes an already stored inaccessible relationship ID with an explicit empty filter array", async () => {
    enableContactFilters(repo);
    widgetFindIds.mockResolvedValue(new Set([WIDGET_ID]));
    repo.getWidgetKind.mockResolvedValue(WidgetKind.activityTimeline);
    const existing = activityDto(activityInput(WIDGET_ID));
    existing.timelineFilters = [contactMembershipFilter(STALE_CONTACT_ID)];
    repo.getWidgetById.mockResolvedValue(existing);
    const input = activityInput(WIDGET_ID);
    input.timelineFilters = [];
    const { interactor } = makeRelationshipInteractor(repo);

    const result = await interactor.invoke(input);

    expect(result.ok).toBe(true);
    expect(repo.upsertWidget).toHaveBeenCalledWith({ data: input });
  });

  it("rejects adding a new inaccessible relationship ID beside a retained stale ID", async () => {
    enableContactFilters(repo);
    widgetFindIds.mockResolvedValue(new Set([WIDGET_ID]));
    repo.getWidgetKind.mockResolvedValue(WidgetKind.activityTimeline);
    const existing = activityDto(activityInput(WIDGET_ID));
    existing.timelineFilters = [contactMembershipFilter(STALE_CONTACT_ID)];
    repo.getWidgetById.mockResolvedValue(existing);
    const input = activityInput(WIDGET_ID);
    input.timelineFilters = [contactMembershipFilter(STALE_CONTACT_ID, NEW_INACCESSIBLE_CONTACT_ID)];
    const { contactValidator, interactor } = makeRelationshipInteractor(repo);

    const result = await interactor.invoke(input);

    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).toContain(CustomErrorCode.contactNotFound);
    expect(contactValidator.invoke).toHaveBeenCalledWith(
      [{ ids: [NEW_INACCESSIBLE_CONTACT_ID], path: ["filters", 0, "value"] }],
      expect.anything(),
    );
    expect(repo.upsertWidget).not.toHaveBeenCalled();
  });

  it("rejects changing an existing widget kind", async () => {
    widgetFindIds.mockResolvedValue(new Set([WIDGET_ID]));
    repo.getWidgetKind.mockResolvedValue(WidgetKind.chart);

    const result = await makeInteractor(repo).invoke(activityInput(WIDGET_ID));

    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).toContain(CustomErrorCode.widgetKindImmutable);
    expect(repo.upsertWidget).not.toHaveBeenCalled();
  });

  it("rejects a saved activity filter the viewer cannot use", async () => {
    const input = activityInput();
    input.timelineFilters = [
      {
        field: FilterFieldKey.provider,
        operator: FilterOperatorKey.in,
        value: ["google"],
      },
    ];

    const result = await makeInteractor(repo).invoke(input);

    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).toContain(CustomErrorCode.invalidFilterField);
    expect(repo.upsertWidget).not.toHaveBeenCalled();
  });

  it("rejects more filters than an activity query can accept", async () => {
    const input = activityInput();
    input.timelineFilters = Array.from({ length: 51 }, () => ({
      field: FilterFieldKey.timelineKind,
      operator: FilterOperatorKey.in,
      value: ["audit"],
    }));

    const result = await makeInteractor(repo).invoke(input);

    expect(result.ok).toBe(false);
    expect(repo.upsertWidget).not.toHaveBeenCalled();
  });

  it("rejects activity widget creation when entitlement denial leaves no available source", async () => {
    repo.getActivityFilterableFields.mockResolvedValue([]);

    const result = await makeInteractor(repo, true).invoke(activityInput());

    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).toContain(CustomErrorCode.activitySourcesUnavailable);
    expect(repo.setMessagingSourcesEnabled).toHaveBeenCalledWith(false);
    expect(repo.upsertWidget).not.toHaveBeenCalled();
  });
});
