import type { Prisma, PrismaClient } from "@/generated/prisma";

import { SURFACE } from "@/core/data-view/data-view-keys";
import { WidgetKind } from "@/generated/prisma";

import type { SeedContext } from "./context";
import type { CustomFieldSeedData } from "./custom-fields";
import { SEED_IDS } from "./context";
import { SYNTHETIC_CUSTOM_FIELD_IDS, SYNTHETIC_CUSTOM_OPTION_IDS } from "./custom-fields";
import {
  buildSyntheticDashboards,
  dashboardLayouts,
  dashboardWidgetId,
  SYNTHETIC_WIDGET_ID_PREFIX,
  type DashboardDefinition,
} from "./dashboards";
import { SYNTHETIC_DASHBOARD_VIEW_ID_PREFIX } from "./data-view-ids";
import { persistSyntheticDataViewFixtures, type SyntheticDataViewFixture } from "./data-views";
import { upsertFixturesById } from "./helpers";

export { SYNTHETIC_MAIN_DASHBOARD } from "./dashboards";

/** Widget names in seed order, dashboard by dashboard. */
export const SYNTHETIC_WIDGET_NAMES = buildSyntheticDashboards(SEED_IDS.company, {
  customFieldIds: SYNTHETIC_CUSTOM_FIELD_IDS,
  customOptionIds: SYNTHETIC_CUSTOM_OPTION_IDS,
}).flatMap(({ widgets }) => widgets.map(({ name }) => name));

export type SyntheticWidgetFixture = {
  id: string;
  companyId: string;
  userId: string;
  viewId: string | null;
  name: string;
  kind: WidgetKind;
  displayOptions: Prisma.InputJsonValue;
  isTemplate: boolean;
  layout: Prisma.InputJsonValue;
  measure?: Prisma.InputJsonValue;
  activityQuery?: Prisma.InputJsonValue;
};

export function buildSyntheticDashboardViewFixtures(
  context: Pick<SeedContext, "ids">,
  dashboards: DashboardDefinition[],
): SyntheticDataViewFixture[] {
  return dashboards
    .flatMap(({ viewId, name }) => (viewId ? [{ viewId, name }] : []))
    .map(({ viewId, name }, position) => ({
      id: viewId,
      userId: context.ids.user,
      surfaceKey: SURFACE.dashboard,
      name,
      position,
      state: {},
    }));
}

export function buildSyntheticWidgetFixtures(
  context: Pick<SeedContext, "ids">,
  dashboards: DashboardDefinition[],
): SyntheticWidgetFixture[] {
  return dashboards.flatMap(({ key, viewId, widgets }) => {
    const ids = widgets.map((_, index) => dashboardWidgetId(key, index));
    const layouts = dashboardLayouts(ids, widgets);
    return widgets.map((widget, index): SyntheticWidgetFixture => {
      const base = {
        id: ids[index],
        companyId: context.ids.company,
        userId: context.ids.user,
        viewId,
        name: widget.name,
        isTemplate: false,
        layout: layouts[index] as Prisma.InputJsonValue,
      };
      if (widget.kind === "activityTimeline") {
        return {
          ...base,
          kind: WidgetKind.activityTimeline,
          displayOptions: { showFilters: true },
          activityQuery: widget.activityQuery as Prisma.InputJsonValue,
        };
      }
      const filtered = widget.measure.source.filters.length + widget.measure.source.relationships.length > 0;
      return {
        ...base,
        kind: WidgetKind.chart,
        displayOptions: {
          barColors: widget.barColors,
          displayType: widget.displayType,
          reverseXAxis: false,
          reverseYAxis: false,
          showFilters: filtered,
          showLegend: widget.useGroupColors,
          useGroupColors: widget.useGroupColors,
        },
        measure: widget.measure as Prisma.InputJsonValue,
      };
    });
  });
}

export async function persistSyntheticWidgetFixtures(
  prisma: Pick<PrismaClient, "widget">,
  companyId: string,
  widgets: SyntheticWidgetFixture[],
): Promise<void> {
  await upsertFixturesById(widgets, (widget) =>
    prisma.widget.upsert({ where: { id: widget.id }, update: widget, create: widget }),
  );
  await prisma.widget.deleteMany({
    where: { companyId, id: { startsWith: `${SYNTHETIC_WIDGET_ID_PREFIX}-`, notIn: widgets.map(({ id }) => id) } },
  });
}

/**
 * Seeds the six dashboards: the Sales widgets on the main dashboard (no view), so /en/dashboard opens on them,
 * and the five other dashboards as dashboard views, written before the widgets that reference them.
 */
export async function seedWidgets(context: SeedContext, customFields: CustomFieldSeedData): Promise<void> {
  const dashboards = buildSyntheticDashboards(context.ids.company, customFields);
  await persistSyntheticDataViewFixtures(
    context.prisma,
    context.ids.company,
    buildSyntheticDashboardViewFixtures(context, dashboards),
    SYNTHETIC_DASHBOARD_VIEW_ID_PREFIX,
  );
  await persistSyntheticWidgetFixtures(
    context.prisma,
    context.ids.company,
    buildSyntheticWidgetFixtures(context, dashboards),
  );
}
