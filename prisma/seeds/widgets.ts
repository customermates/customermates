import type { Prisma } from "@/generated/prisma";
import { WidgetKind } from "@/generated/prisma";
import type { RecordMeasure } from "@/features/records/record-measure.schema";

import type { SeedContext } from "./context";
import type { CustomFieldSeedData } from "./custom-fields";

import { fixtureId, upsertFixturesById } from "./helpers";
import { syntheticRecordKeys } from "./record-keys";

export const SYNTHETIC_WIDGET_NAMES = [
  "Deal Value By Organizations",
  "Sales Pipeline",
  "Total Deal Value",
  "Deal Overview",
  "Recent Changes",
  "Messages",
  "Events",
] as const;

type LayoutGeometry = {
  h: number;
  w: number;
  x: number;
  y: number;
};

type LayoutGeometryByBreakpoint = {
  lg: LayoutGeometry;
  md: LayoutGeometry;
  sm: LayoutGeometry;
  xs: LayoutGeometry;
};

function widgetLayout(id: string, geometry: LayoutGeometryByBreakpoint) {
  return {
    lg: { i: id, ...geometry.lg },
    md: { i: id, ...geometry.md },
    sm: { i: id, ...geometry.sm },
    xs: { i: id, ...geometry.xs },
  };
}

export async function seedWidgets(context: SeedContext, customFields: CustomFieldSeedData): Promise<void> {
  const { prisma, ids } = context;
  const { customFieldIds, customOptionIds } = customFields;
  const { id } = syntheticRecordKeys(ids.company);
  const toOrganizations = [{ relationId: id("deal.organizations"), direction: "outgoing" as const }];
  const withoutAbandonedDeals = {
    typeId: id("deal"),
    filters: [
      {
        fieldId: customFieldIds.dealStatus,
        operator: "notIn" as const,
        value: null,
        values: [{ kind: "select" as const, value: customOptionIds.dealStatus.abandoned }],
      },
    ],
    relationships: [],
    relatedFilters: [],
  };
  const chartDefinitions: Array<{
    barColors: readonly string[];
    displayType: string;
    idSuffix: number;
    layout: LayoutGeometryByBreakpoint;
    measure: RecordMeasure;
    name: string;
    useGroupColors: boolean;
  }> = [
    {
      barColors: ["primary1", "primary2", "primary3"],
      displayType: "horizontalBarChartWithLabels",
      idSuffix: 2,
      layout: {
        lg: { h: 2, w: 3, x: 0, y: 0 },
        md: { h: 2, w: 2, x: 0, y: 0 },
        sm: { h: 2, w: 2, x: 0, y: 0 },
        xs: { h: 2, w: 1, x: 0, y: 0 },
      },
      measure: {
        source: {
          typeId: id("deal"),
          filters: [],
          relationships: [],
          relatedFilters: [{ path: toOrganizations, operator: "any", filters: [], relationships: [] }],
        },
        aggregation: "sum",
        valueFieldId: id("deal.totalValue"),
        groupBy: {
          path: toOrganizations,
          fieldId: null,
          filter: { filters: [], relationships: [], relatedFilters: [] },
        },
        groupLimit: 1000,
      },
      name: SYNTHETIC_WIDGET_NAMES[0],
      useGroupColors: true,
    },
    {
      barColors: ["default1", "default2", "primary1", "primary2", "secondary1", "secondary2"],
      displayType: "doughnutChart",
      idSuffix: 3,
      layout: {
        lg: { h: 2, w: 3, x: 3, y: 0 },
        md: { h: 2, w: 2, x: 2, y: 0 },
        sm: { h: 2, w: 2, x: 2, y: 0 },
        xs: { h: 2, w: 1, x: 1, y: 0 },
      },
      measure: {
        source: { typeId: id("contact"), filters: [], relationships: [], relatedFilters: [] },
        aggregation: "count",
        valueFieldId: null,
        groupBy: { path: [], fieldId: customFieldIds.contactSalesPipeline },
        groupLimit: 1000,
      },
      name: SYNTHETIC_WIDGET_NAMES[1],
      useGroupColors: false,
    },
    {
      barColors: ["success1", "warning1", "danger1"],
      displayType: "doughnutChart",
      idSuffix: 4,
      layout: {
        lg: { h: 2, w: 3, x: 9, y: 0 },
        md: { h: 2, w: 2, x: 6, y: 0 },
        sm: { h: 2, w: 2, x: 2, y: 2 },
        xs: { h: 2, w: 1, x: 1, y: 2 },
      },
      measure: {
        source: withoutAbandonedDeals,
        aggregation: "sum",
        valueFieldId: id("deal.totalValue"),
        groupBy: { path: [], fieldId: customFieldIds.dealStatus },
        groupLimit: 1000,
      },
      name: SYNTHETIC_WIDGET_NAMES[2],
      useGroupColors: true,
    },
    {
      barColors: ["success1", "warning1", "danger1"],
      displayType: "verticalBarChart",
      idSuffix: 5,
      layout: {
        lg: { h: 2, w: 3, x: 6, y: 0 },
        md: { h: 2, w: 2, x: 4, y: 0 },
        sm: { h: 2, w: 2, x: 0, y: 2 },
        xs: { h: 2, w: 1, x: 0, y: 2 },
      },
      measure: {
        source: withoutAbandonedDeals,
        aggregation: "count",
        valueFieldId: null,
        groupBy: { path: [], fieldId: customFieldIds.dealStatus },
        groupLimit: 1000,
      },
      name: SYNTHETIC_WIDGET_NAMES[3],
      useGroupColors: true,
    },
  ];

  const chartWidgets = chartDefinitions.map((definition) => {
    const widgetId = fixtureId("15000000", definition.idSuffix);
    return {
      id: widgetId,
      companyId: ids.company,
      userId: ids.user,
      name: definition.name,
      kind: WidgetKind.chart,
      displayOptions: {
        barColors: definition.barColors,
        displayType: definition.displayType,
        reverseXAxis: false,
        reverseYAxis: false,
        showFilters: true,
        showLegend: true,
        useGroupColors: definition.useGroupColors,
      },
      isTemplate: false,
      layout: widgetLayout(widgetId, definition.layout),
      measure: definition.measure as Prisma.InputJsonValue,
    };
  });

  const activityDefinitions = [
    {
      sources: ["audit"],
      idSuffix: 7,
      layout: {
        lg: { h: 3, w: 4, x: 0, y: 2 },
        md: { h: 3, w: 4, x: 0, y: 2 },
        sm: { h: 3, w: 4, x: 0, y: 7 },
        xs: { h: 3, w: 2, x: 0, y: 4 },
      },
      name: SYNTHETIC_WIDGET_NAMES[4],
    },
    {
      sources: ["message"],
      idSuffix: 8,
      layout: {
        lg: { h: 3, w: 4, x: 4, y: 2 },
        md: { h: 3, w: 4, x: 4, y: 2 },
        sm: { h: 3, w: 4, x: 0, y: 4 },
        xs: { h: 3, w: 2, x: 0, y: 7 },
      },
      name: SYNTHETIC_WIDGET_NAMES[5],
    },
    {
      sources: ["activity", "calendar_event"],
      idSuffix: 9,
      layout: {
        lg: { h: 3, w: 4, x: 8, y: 2 },
        md: { h: 3, w: 8, x: 0, y: 5 },
        sm: { h: 3, w: 4, x: 0, y: 10 },
        xs: { h: 3, w: 2, x: 0, y: 10 },
      },
      name: SYNTHETIC_WIDGET_NAMES[6],
    },
  ] as const;

  const activityWidgets = activityDefinitions.map((definition) => {
    const widgetId = fixtureId("15000000", definition.idSuffix);
    return {
      id: widgetId,
      companyId: ids.company,
      userId: ids.user,
      name: definition.name,
      kind: WidgetKind.activityTimeline,
      displayOptions: { showFilters: true },
      isTemplate: false,
      layout: widgetLayout(widgetId, definition.layout),
      activityQuery: {
        scope: { records: [], typeIds: [] },
        kinds: ["audit", "message", "activity", "calendar_event"],
        filters: [{ kind: "source", operator: "in", values: [...definition.sources] }],
      } as Prisma.InputJsonValue,
    };
  });

  const allWidgets = [...chartWidgets, ...activityWidgets];

  await upsertFixturesById(allWidgets, (widget) =>
    prisma.widget.upsert({
      where: { id: widget.id },
      update: widget,
      create: widget,
    }),
  );
  await prisma.widget.deleteMany({
    where: {
      companyId: ids.company,
      id: {
        startsWith: "15000000-",
        notIn: allWidgets.map(({ id }) => id),
      },
    },
  });
}
