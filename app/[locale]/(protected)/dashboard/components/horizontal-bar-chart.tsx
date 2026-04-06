"use client";

import type { ChartDataPoint } from "./chart.types";

import { Bar, BarChart, XAxis, YAxis, ResponsiveContainer, Cell } from "recharts";
import { observer } from "mobx-react-lite";

import { AggregationType } from "@/generated/prisma";

import { useRootStore } from "@/core/stores/root-store.provider";
import { XChartTooltip } from "@/components/x-chart/chart-tooltip";

type Props = {
  aggregationType?: AggregationType;
  chartData: ChartDataPoint[];
  colors: string[];
  gridColor: string;
  textColor: string;
  reverseXAxis?: boolean;
  reverseYAxis?: boolean;
};

export const HorizontalBarChart = observer(
  ({ aggregationType, chartData, colors, gridColor, textColor, reverseXAxis, reverseYAxis }: Props) => {
    const { intlStore } = useRootStore();

    return (
      <ResponsiveContainer height="100%" width="100%">
        <BarChart data={chartData} layout="vertical">
          <XAxis
            domain={[0, "dataMax"]}
            padding={{ right: 1, left: 1 }}
            reversed={Boolean(reverseXAxis)}
            stroke={gridColor}
            tick={{
              fill: textColor,
              fontSize: 12,
              fontFamily: "Inter",
            }}
            tickFormatter={(value) =>
              aggregationType === AggregationType.dealValue
                ? intlStore.formatCurrency(value)
                : intlStore.formatNumber(value)
            }
            type="number"
          />

          <YAxis
            dataKey="label"
            reversed={Boolean(reverseYAxis)}
            stroke={gridColor}
            tick={{
              fill: textColor,
              fontSize: 12,
              fontFamily: "Inter",
            }}
            type="category"
            width="auto"
          />

          <XChartTooltip aggregationType={aggregationType} />

          <Bar dataKey="value" fill={colors[0]} radius={4}>
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.fill} stroke={entry.strokeColor} strokeWidth={1.5} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );
  },
);
