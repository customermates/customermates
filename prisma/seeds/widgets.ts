import type { Prisma } from "@/generated/prisma";

import type { SeedContext } from "./context";
import type { CustomFieldSeedData } from "./custom-fields";

import { fixtureId, upsertFixturesById } from "./helpers";

export const SYNTHETIC_WIDGET_NAMES = [
  "Sold Hardware",
  "Deal Value By Organizations",
  "Sales Pipeline",
  "Total Deal Value",
  "Deal Value By Type",
  "Deal Overview",
  "Organizations",
] as const;

function widgetLayout(id: string, index: number) {
  const layouts = [
    {
      lg: { h: 2, w: 3, x: 3, y: 0 },
      md: { h: 2, w: 2, x: 2, y: 2 },
      sm: { h: 2, w: 1, x: 1, y: 2 },
      xs: { h: 2, w: 1, x: 1, y: 9 },
    },
    {
      lg: { h: 3, w: 4, x: 0, y: 2 },
      md: { h: 3, w: 4, x: 4, y: 0 },
      sm: { h: 3, w: 2, x: 2, y: 0 },
      xs: { h: 3, w: 2, x: 0, y: 2 },
    },
    {
      lg: { h: 3, w: 4, x: 8, y: 2 },
      md: { h: 2, w: 4, x: 4, y: 3 },
      sm: { h: 2, w: 2, x: 2, y: 3 },
      xs: { h: 2, w: 2, x: 0, y: 5 },
    },
    {
      lg: { h: 2, w: 3, x: 6, y: 0 },
      md: { h: 2, w: 2, x: 0, y: 0 },
      sm: { h: 2, w: 1, x: 1, y: 0 },
      xs: { h: 2, w: 1, x: 1, y: 0 },
    },
    {
      lg: { h: 3, w: 4, x: 4, y: 2 },
      md: { h: 2, w: 4, x: 0, y: 4 },
      sm: { h: 2, w: 2, x: 0, y: 4 },
      xs: { h: 2, w: 2, x: 0, y: 7 },
    },
    {
      lg: { h: 2, w: 3, x: 9, y: 0 },
      md: { h: 2, w: 2, x: 2, y: 0 },
      sm: { h: 2, w: 1, x: 0, y: 0 },
      xs: { h: 2, w: 1, x: 0, y: 0 },
    },
    {
      lg: { h: 2, w: 3, x: 0, y: 0 },
      md: { h: 2, w: 2, x: 0, y: 2 },
      sm: { h: 2, w: 1, x: 0, y: 2 },
      xs: { h: 2, w: 1, x: 0, y: 9 },
    },
  ] as const;
  const layout = layouts[index];
  return {
    lg: { i: id, ...layout.lg },
    md: { i: id, ...layout.md },
    sm: { i: id, ...layout.sm },
    xs: { i: id, ...layout.xs },
  };
}

export async function seedWidgets(context: SeedContext, customFields: CustomFieldSeedData): Promise<void> {
  const { prisma, ids } = context;
  const { customColumnIds, customOptionIds } = customFields;
  const entityFilters = [
    [
      {
        field: customColumnIds.serviceType,
        operator: "in",
        value: [customOptionIds.serviceType.hardware],
      },
    ],
    [],
    [],
    [
      {
        field: customColumnIds.dealStatus,
        operator: "notIn",
        value: [customOptionIds.dealStatus.abandoned],
      },
    ],
    [],
    [
      {
        field: customColumnIds.dealStatus,
        operator: "notIn",
        value: [customOptionIds.dealStatus.abandoned],
      },
    ],
    [],
  ] as const;
  const definitions = [
    [SYNTHETIC_WIDGET_NAMES[0], "service", "dealQuantity", "none", null, "doughnutChart", ["secondary1"], true],
    [
      SYNTHETIC_WIDGET_NAMES[1],
      "organization",
      "dealValue",
      "organization",
      null,
      "horizontalBarChartWithLabels",
      ["primary1", "primary2", "primary3"],
      true,
    ],
    [
      SYNTHETIC_WIDGET_NAMES[2],
      "contact",
      "count",
      "customColumn",
      customColumnIds.contactSalesPipeline,
      "doughnutChart",
      ["default1", "default2", "primary1", "primary2", "secondary1", "secondary2"],
      false,
    ],
    [
      SYNTHETIC_WIDGET_NAMES[3],
      "deal",
      "dealValue",
      "customColumn",
      customColumnIds.dealStatus,
      "doughnutChart",
      ["success1", "warning1", "danger1"],
      true,
    ],
    [
      SYNTHETIC_WIDGET_NAMES[4],
      "service",
      "dealValue",
      "customColumn",
      customColumnIds.serviceType,
      "verticalBarChart",
      ["secondary1", "secondary2"],
      true,
    ],
    [
      SYNTHETIC_WIDGET_NAMES[5],
      "deal",
      "count",
      "customColumn",
      customColumnIds.dealStatus,
      "verticalBarChart",
      ["success1", "warning1", "danger1"],
      true,
    ],
    [
      SYNTHETIC_WIDGET_NAMES[6],
      "organization",
      "count",
      "customColumn",
      customColumnIds.organizationType,
      "doughnutChart",
      ["primary1", "secondary1"],
      true,
    ],
  ] as const;

  const widgets = definitions.map(
    (
      [name, entityType, aggregationType, groupByType, groupByCustomColumnId, displayType, barColors, useGroupColors],
      index,
    ) => {
      const id = fixtureId("15000000", index + 1);
      return {
        id,
        aggregationType,
        companyId: ids.company,
        dealFilters: [],
        displayOptions: {
          barColors,
          displayType,
          reverseXAxis: false,
          reverseYAxis: false,
          showFilters: true,
          showLegend: true,
          useGroupColors,
        },
        entityFilters: entityFilters[index],
        entityType,
        groupByCustomColumnId,
        groupByType,
        isTemplate: false,
        layout: widgetLayout(id, index),
        name,
        userId: ids.user,
      } satisfies Prisma.WidgetCreateManyInput;
    },
  );

  await upsertFixturesById(widgets, (widget) =>
    prisma.widget.upsert({
      where: { id: widget.id },
      update: widget,
      create: widget,
    }),
  );
}
