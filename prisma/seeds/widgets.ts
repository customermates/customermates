import { Prisma, WidgetKind } from "@/generated/prisma";

import type { SeedContext } from "./context";
import type { CustomFieldSeedData } from "./custom-fields";

import { fixtureId, upsertFixturesById } from "./helpers";

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
  const { customColumnIds, customOptionIds } = customFields;
  const dealStatusFilter = [
    {
      field: customColumnIds.dealStatus,
      operator: "notIn",
      value: [customOptionIds.dealStatus.abandoned],
    },
  ] as const;
  const chartDefinitions = [
    {
      aggregationType: "dealValue",
      barColors: ["primary1", "primary2", "primary3"],
      displayType: "horizontalBarChartWithLabels",
      entityFilters: [],
      entityType: "organization",
      groupByCustomColumnId: null,
      groupByType: "organization",
      idSuffix: 2,
      layout: {
        lg: { h: 2, w: 3, x: 0, y: 0 },
        md: { h: 2, w: 2, x: 0, y: 0 },
        sm: { h: 2, w: 2, x: 0, y: 0 },
        xs: { h: 2, w: 1, x: 0, y: 0 },
      },
      name: SYNTHETIC_WIDGET_NAMES[0],
      useGroupColors: true,
    },
    {
      aggregationType: "count",
      barColors: ["default1", "default2", "primary1", "primary2", "secondary1", "secondary2"],
      displayType: "doughnutChart",
      entityFilters: [],
      entityType: "contact",
      groupByCustomColumnId: customColumnIds.contactSalesPipeline,
      groupByType: "customColumn",
      idSuffix: 3,
      layout: {
        lg: { h: 2, w: 3, x: 3, y: 0 },
        md: { h: 2, w: 2, x: 2, y: 0 },
        sm: { h: 2, w: 2, x: 2, y: 0 },
        xs: { h: 2, w: 1, x: 1, y: 0 },
      },
      name: SYNTHETIC_WIDGET_NAMES[1],
      useGroupColors: false,
    },
    {
      aggregationType: "dealValue",
      barColors: ["success1", "warning1", "danger1"],
      displayType: "doughnutChart",
      entityFilters: dealStatusFilter,
      entityType: "deal",
      groupByCustomColumnId: customColumnIds.dealStatus,
      groupByType: "customColumn",
      idSuffix: 4,
      layout: {
        lg: { h: 2, w: 3, x: 9, y: 0 },
        md: { h: 2, w: 2, x: 6, y: 0 },
        sm: { h: 2, w: 2, x: 2, y: 2 },
        xs: { h: 2, w: 1, x: 1, y: 2 },
      },
      name: SYNTHETIC_WIDGET_NAMES[2],
      useGroupColors: true,
    },
    {
      aggregationType: "count",
      barColors: ["success1", "warning1", "danger1"],
      displayType: "verticalBarChart",
      entityFilters: dealStatusFilter,
      entityType: "deal",
      groupByCustomColumnId: customColumnIds.dealStatus,
      groupByType: "customColumn",
      idSuffix: 5,
      layout: {
        lg: { h: 2, w: 3, x: 6, y: 0 },
        md: { h: 2, w: 2, x: 4, y: 0 },
        sm: { h: 2, w: 2, x: 0, y: 2 },
        xs: { h: 2, w: 1, x: 0, y: 2 },
      },
      name: SYNTHETIC_WIDGET_NAMES[3],
      useGroupColors: true,
    },
  ] as const satisfies ReadonlyArray<{
    aggregationType: string;
    barColors: readonly string[];
    displayType: string;
    entityFilters: readonly unknown[];
    entityType: string;
    groupByCustomColumnId: string | null;
    groupByType: string;
    idSuffix: number;
    layout: LayoutGeometryByBreakpoint;
    name: string;
    useGroupColors: boolean;
  }>;

  const chartWidgets = chartDefinitions.map((definition) => {
    const id = fixtureId("15000000", definition.idSuffix);
    return {
      id,
      kind: WidgetKind.chart,
      aggregationType: definition.aggregationType,
      companyId: ids.company,
      dealFilters: [],
      displayOptions: {
        barColors: definition.barColors,
        displayType: definition.displayType,
        reverseXAxis: false,
        reverseYAxis: false,
        showFilters: true,
        showLegend: true,
        useGroupColors: definition.useGroupColors,
      },
      entityFilters: definition.entityFilters,
      entityType: definition.entityType,
      groupByCustomColumnId: definition.groupByCustomColumnId,
      groupByType: definition.groupByType,
      timelineFilters: Prisma.DbNull,
      isTemplate: false,
      layout: widgetLayout(id, definition.layout),
      name: definition.name,
      userId: ids.user,
    } satisfies Prisma.WidgetCreateManyInput;
  });

  const activityDefinitions = [
    {
      filterValue: "changes",
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
      filterValue: "messages",
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
      filterValue: "activities",
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
    const id = fixtureId("15000000", definition.idSuffix);
    return {
      id,
      companyId: ids.company,
      kind: WidgetKind.activityTimeline,
      name: definition.name,
      entityType: null,
      entityFilters: Prisma.DbNull,
      dealFilters: Prisma.DbNull,
      groupByType: null,
      groupByCustomColumnId: null,
      aggregationType: null,
      displayOptions: { showFilters: true },
      timelineFilters: [
        {
          field: "timelineKind",
          operator: "in",
          value: [definition.filterValue],
        },
      ],
      isTemplate: false,
      layout: widgetLayout(id, definition.layout),
      userId: ids.user,
    } satisfies Prisma.WidgetCreateManyInput;
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
