import type { DataViewState } from "@/core/data-view/data-view-state.schema";
import type { Filter } from "@/core/base/base-get.schema";
import type { DataViewVisibility, PrismaClient } from "@/generated/prisma";

import { ALL_VIEW_KEY, isDataViewSurfaceKey, SURFACE } from "@/core/data-view/data-view-keys";
import { FilterOperatorKey, ViewMode } from "@/core/base/base-query-builder";
import { writeStoredState } from "@/features/data-view/data-view-row-mapping";

import type { SeedContext } from "./context";
import type { CustomFieldSeedData } from "./custom-fields";
import type { SyntheticP13nFixture } from "./personalization";

import {
  SYNTHETIC_DATA_VIEW_ID_PREFIX,
  SYNTHETIC_DATA_VIEW_IDS,
  SYNTHETIC_DATA_VIEW_OVERRIDE_ID_PREFIX,
} from "./data-view-ids";
import { fixtureId } from "./helpers";
import { buildSyntheticP13nFixtures } from "./personalization";

export {
  SYNTHETIC_DATA_VIEW_ID_PREFIX,
  SYNTHETIC_DATA_VIEW_IDS,
  SYNTHETIC_DATA_VIEW_OVERRIDE_ID_PREFIX,
} from "./data-view-ids";

export type SyntheticDataViewFixture = {
  id: string;
  userId: string;
  surfaceKey: string;
  name: string;
  visibility: DataViewVisibility;
  position: number;
  state: DataViewState;
};

export type SyntheticDataViewOverrideFixture = {
  id: string;
  userId: string;
  surfaceKey: string;
  viewKey: string;
  state: DataViewState;
};

function isNonEmptyArray(value: unknown): value is unknown[] {
  return Array.isArray(value) && value.length > 0;
}

function isNonEmptyObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) && Object.keys(value).length > 0;
}

function storedPageSize(pagination: unknown): DataViewState["pageSize"] {
  if (!isNonEmptyObject(pagination)) return undefined;
  const pageSize = pagination.pageSize;

  return pageSize === 5 || pageSize === 10 || pageSize === 25 || pageSize === 100 ? pageSize : undefined;
}

export function personalizationStateToOverrideState(fixture: SyntheticP13nFixture): DataViewState {
  const state: DataViewState = {};

  if (isNonEmptyArray(fixture.filters)) state.filters = fixture.filters as unknown as Filter[];
  if (fixture.searchTerm) state.searchTerm = fixture.searchTerm;
  if (isNonEmptyObject(fixture.sortDescriptor))
    state.sortDescriptor = fixture.sortDescriptor as DataViewState["sortDescriptor"];
  const pageSize = storedPageSize(fixture.pagination);
  if (pageSize !== undefined) state.pageSize = pageSize;
  if (fixture.viewMode) state.viewMode = fixture.viewMode as ViewMode;
  if (fixture.groupingColumnId) state.groupingColumnId = fixture.groupingColumnId;
  if (isNonEmptyArray(fixture.columnOrder)) state.columnOrder = fixture.columnOrder;
  if (isNonEmptyObject(fixture.columnWidths)) state.columnWidths = fixture.columnWidths as Record<string, number>;
  if (isNonEmptyArray(fixture.hiddenColumns)) state.hiddenColumns = fixture.hiddenColumns;

  return state;
}

export function buildSyntheticDataViewFixtures(
  context: Pick<SeedContext, "ids">,
  customFields: CustomFieldSeedData,
): SyntheticDataViewFixture[] {
  const { customColumnIds, customOptionIds } = customFields;
  const { sofiaRossiUser } = context.ids;

  return [
    {
      id: SYNTHETIC_DATA_VIEW_IDS.sharedOpenDeals,
      userId: sofiaRossiUser,
      surfaceKey: SURFACE.deals,
      name: "Open deals",
      visibility: "workspace",
      position: 0,
      state: {
        filters: [
          {
            field: customColumnIds.dealStatus,
            operator: FilterOperatorKey.in,
            value: [customOptionIds.dealStatus.open],
          },
        ],
        viewMode: ViewMode.card,
        groupingColumnId: customColumnIds.dealStatus,
      },
    },
  ];
}

export function buildSyntheticDataViewOverrideFixtures(
  context: Pick<SeedContext, "ids">,
  customFields: CustomFieldSeedData,
): SyntheticDataViewOverrideFixture[] {
  return buildSyntheticP13nFixtures(context, customFields)
    .filter(({ p13nId }) => isDataViewSurfaceKey(p13nId))
    .map((fixture, index) => ({
      id: fixtureId(SYNTHETIC_DATA_VIEW_OVERRIDE_ID_PREFIX, index + 1),
      userId: fixture.userId,
      surfaceKey: fixture.p13nId,
      viewKey: ALL_VIEW_KEY,
      state: personalizationStateToOverrideState(fixture),
    }));
}

export async function persistSyntheticDataViewFixtures(
  prisma: Pick<PrismaClient, "dataView" | "dataViewOverride">,
  companyId: string,
  views: SyntheticDataViewFixture[],
  overrides: SyntheticDataViewOverrideFixture[],
): Promise<void> {
  for (const view of views) {
    const { id, state, ...rest } = view;
    const data = { companyId, ...rest, ...writeStoredState(state) };
    await prisma.dataView.upsert({ where: { id }, update: data, create: { id, ...data } });
  }

  await prisma.dataView.deleteMany({
    where: {
      companyId,
      id: { startsWith: `${SYNTHETIC_DATA_VIEW_ID_PREFIX}-`, notIn: views.map(({ id }) => id) },
    },
  });

  for (const override of overrides) {
    const { id, state, userId, surfaceKey, viewKey } = override;
    const data = {
      companyId,
      userId,
      surfaceKey,
      viewKey,
      viewId: viewKey === ALL_VIEW_KEY ? null : viewKey,
      ...writeStoredState(state),
    };
    await prisma.dataViewOverride.upsert({
      where: { companyId_userId_surfaceKey_viewKey: { companyId, userId, surfaceKey, viewKey } },
      update: data,
      create: { id, ...data },
    });
  }

  await prisma.dataViewOverride.deleteMany({
    where: {
      companyId,
      id: { startsWith: `${SYNTHETIC_DATA_VIEW_OVERRIDE_ID_PREFIX}-`, notIn: overrides.map(({ id }) => id) },
    },
  });
}

export async function seedDataViews(context: SeedContext, customFields: CustomFieldSeedData): Promise<void> {
  const views = buildSyntheticDataViewFixtures(context, customFields);
  const overrides = buildSyntheticDataViewOverrideFixtures(context, customFields);

  await persistSyntheticDataViewFixtures(context.prisma, context.ids.company, views, overrides);
}
