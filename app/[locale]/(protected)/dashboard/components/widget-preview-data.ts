import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { DiagramDataPoint } from "@/features/widget/widget.schema";

import { AggregationType, CustomColumnType, WidgetGroupByType } from "@/generated/prisma";

const PREVIEW_TOTALS: Record<AggregationType, number> = {
  [AggregationType.count]: 128,
  [AggregationType.dealValue]: 375000,
  [AggregationType.dealQuantity]: 86,
  [AggregationType.dealWeightedValue]: 142500,
};

const DISTRIBUTIONS: Record<number, number[]> = {
  1: [1],
  2: [0.62, 0.38],
  3: [0.48, 0.32, 0.2],
  4: [0.4, 0.28, 0.2, 0.12],
};

type BuildChartPreviewDataArgs = {
  aggregationType: AggregationType;
  customColumns: CustomColumnDto[];
  fallbackLabels: string[];
  groupByCustomColumnId?: string;
  groupByType: WidgetGroupByType;
};

export function getChartPreviewTotal(aggregationType: AggregationType): number {
  return PREVIEW_TOTALS[aggregationType];
}

export function buildChartPreviewData({
  aggregationType,
  customColumns,
  fallbackLabels,
  groupByCustomColumnId,
  groupByType,
}: BuildChartPreviewDataArgs): DiagramDataPoint[] {
  const total = getChartPreviewTotal(aggregationType);
  if (groupByType === WidgetGroupByType.none) return [{ labelKind: "system", systemLabelKey: "total", value: total }];

  const selectedColumn =
    groupByType === WidgetGroupByType.customColumn
      ? customColumns.find(
          (column) => column.id === groupByCustomColumnId && column.type === CustomColumnType.singleSelect,
        )
      : undefined;
  const selectedOptions =
    selectedColumn?.type === CustomColumnType.singleSelect
      ? selectedColumn.options.options.toSorted((a, b) => a.index - b.index).slice(0, 4)
      : [];
  const labels = selectedOptions.length > 0 ? selectedOptions.map(({ label }) => label) : fallbackLabels.slice(0, 4);
  const weights = DISTRIBUTIONS[labels.length] ?? DISTRIBUTIONS[4];
  let assigned = 0;

  return labels.map((label, index) => {
    const isLast = index === labels.length - 1;
    const value = isLast ? total - assigned : Math.round(total * weights[index]);
    assigned += value;

    return {
      labelKind: "literal" as const,
      label,
      value,
      optionColor: selectedOptions[index]?.color,
    };
  });
}
