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

import type { FilterableField } from "@/core/base/base-get.schema";

import { FilterOperatorKey } from "@/core/base/base-query-builder";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { EntityType } from "@/generated/prisma";
import { activityFilterableFieldsFor } from "@/ee/messaging/activities/activity-filterable-fields";
import { GetWidgetFilterableFieldsInteractor } from "../get-widget-filterable-fields.interactor";

const field = (fieldName: string): FilterableField => ({
  field: fieldName,
  operators: [FilterOperatorKey.in],
});

function makeInteractor(args: { canReadMessaging: boolean; entitlementDenied: boolean }) {
  let messagingEnabled = false;
  const chartRepos = Object.values(EntityType).map((entityType) => ({
    getFilterableFields: vi.fn().mockResolvedValue([field(`${entityType}-field`)]),
  }));
  const activityRepo = {
    canReadMessagingSources: vi.fn(() => args.canReadMessaging),
    setMessagingSourcesEnabled: vi.fn((enabled: boolean) => {
      messagingEnabled = enabled;
    }),
    getFilterableFields: vi.fn(() =>
      Promise.resolve([
        field(FilterFieldKey.timelineKind),
        ...(messagingEnabled ? [field(FilterFieldKey.connectedAccountId)] : []),
      ]),
    ),
  };
  const entitlements = {
    require: vi.fn().mockResolvedValue(args.entitlementDenied ? { ok: false } : null),
  };

  return {
    activityRepo,
    entitlements,
    interactor: new GetWidgetFilterableFieldsInteractor(
      chartRepos[0],
      chartRepos[1],
      chartRepos[2],
      chartRepos[3],
      chartRepos[4],
      activityRepo,
      entitlements as never,
    ),
  };
}

describe("activity filterable fields", () => {
  it("exposes only readable relationship types plus category for audit-only access", () => {
    const fields = activityFilterableFieldsFor({
      canReadAudit: true,
      canReadMessages: false,
      readableEntityTypes: [EntityType.contact, EntityType.deal],
    });

    expect(fields.map((candidate) => candidate.field)).toEqual([
      FilterFieldKey.contactIds,
      FilterFieldKey.dealIds,
      FilterFieldKey.timelineKind,
    ]);
  });

  it("adds messaging fields only when messaging sources are readable", () => {
    const fields = activityFilterableFieldsFor({
      canReadAudit: false,
      canReadMessages: true,
      readableEntityTypes: [EntityType.organization],
    });

    expect(fields.map((candidate) => candidate.field)).toEqual([
      FilterFieldKey.organizationIds,
      FilterFieldKey.timelineKind,
      FilterFieldKey.timelineThreadId,
      FilterFieldKey.provider,
      FilterFieldKey.connectedAccountId,
    ]);
  });

  it("returns no fields when no activity source is readable", () => {
    expect(
      activityFilterableFieldsFor({
        canReadAudit: false,
        canReadMessages: false,
        readableEntityTypes: Object.values(EntityType),
      }),
    ).toEqual([]);
  });
});

describe("GetWidgetFilterableFieldsInteractor", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps chart fields grouped by entity and enables entitled messaging fields", async () => {
    const { activityRepo, entitlements, interactor } = makeInteractor({
      canReadMessaging: true,
      entitlementDenied: false,
    });

    const result = await interactor.invoke();

    expect(result.data.chart[EntityType.contact]).toEqual([field("contact-field")]);
    expect(result.data.chart[EntityType.task]).toEqual([field("task-field")]);
    expect(result.data.activityTimeline.map((candidate) => candidate.field)).toEqual([
      FilterFieldKey.timelineKind,
      FilterFieldKey.connectedAccountId,
    ]);
    expect(entitlements.require).toHaveBeenCalledExactlyOnceWith("messaging");
    expect(activityRepo.setMessagingSourcesEnabled).toHaveBeenCalledExactlyOnceWith(true);
  });

  it("disables messaging fields after entitlement denial", async () => {
    const { activityRepo, interactor } = makeInteractor({
      canReadMessaging: true,
      entitlementDenied: true,
    });

    const result = await interactor.invoke();

    expect(result.data.activityTimeline.map((candidate) => candidate.field)).toEqual([FilterFieldKey.timelineKind]);
    expect(activityRepo.setMessagingSourcesEnabled).toHaveBeenCalledExactlyOnceWith(false);
  });

  it("does not request messaging entitlement without inbox permission", async () => {
    const { activityRepo, entitlements, interactor } = makeInteractor({
      canReadMessaging: false,
      entitlementDenied: false,
    });

    await interactor.invoke();

    expect(entitlements.require).not.toHaveBeenCalled();
    expect(activityRepo.setMessagingSourcesEnabled).toHaveBeenCalledExactlyOnceWith(false);
  });
});
