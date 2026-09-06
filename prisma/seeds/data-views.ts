import type { DataViewState } from "@/core/data-view/data-view-state.schema";
import type { PrismaClient } from "@/generated/prisma";

import { SURFACE } from "@/core/data-view/data-view-keys";
import { FilterOperatorKey, ViewMode } from "@/core/base/base-query-builder";
import { writeStoredState } from "@/features/data-view/data-view-row-mapping";

import type { SeedContext } from "./context";
import type { CustomFieldSeedData } from "./custom-fields";

import { SYNTHETIC_DATA_VIEW_ID_PREFIX, SYNTHETIC_DATA_VIEW_IDS } from "./data-view-ids";

export { SYNTHETIC_DATA_VIEW_ID_PREFIX, SYNTHETIC_DATA_VIEW_IDS } from "./data-view-ids";

export type SyntheticDataViewFixture = {
  id: string;
  userId: string;
  surfaceKey: string;
  name: string;
  position: number;
  state: DataViewState;
};

export function buildSyntheticDataViewFixtures(
  context: Pick<SeedContext, "ids">,
  customFields: CustomFieldSeedData,
): SyntheticDataViewFixture[] {
  const { customColumnIds, customOptionIds } = customFields;
  const { user } = context.ids;

  return [
    {
      id: SYNTHETIC_DATA_VIEW_IDS.openDeals,
      userId: user,
      surfaceKey: SURFACE.deals,
      name: "Open deals",
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
        grouping: { field: customColumnIds.dealStatus },
      },
    },
  ];
}

export async function persistSyntheticDataViewFixtures(
  prisma: Pick<PrismaClient, "dataView">,
  companyId: string,
  views: SyntheticDataViewFixture[],
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
}

export async function seedDataViews(context: SeedContext, customFields: CustomFieldSeedData): Promise<void> {
  const views = buildSyntheticDataViewFixtures(context, customFields);

  await persistSyntheticDataViewFixtures(context.prisma, context.ids.company, views);
}
