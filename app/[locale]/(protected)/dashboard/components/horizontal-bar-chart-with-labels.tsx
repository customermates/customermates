"use client";

import type { ChartDataPoint } from "./chart.types";

import { Bar, BarChart, LabelList, XAxis, YAxis, ResponsiveContainer, Cell } from "recharts";
import { observer } from "mobx-react-lite";
import { AggregationType } from "@/generated/prisma";

import { useRootStore } from "@/core/stores/root-store.provider";
import { XChartTooltip } from "@/components/x-chart/chart-tooltip";

type Props = {
  aggregationType?: AggregationType;
  chartData: ChartDataPoint[];
  textColor: string;
  reverseXAxis?: boolean;
  reverseYAxis?: boolean;
};

export const HorizontalBarChartWithLabels = observer(
  ({ aggregationType, chartData, textColor, reverseXAxis, reverseYAxis }: Props) => {
    const { intlStore } = useRootStore();

    const maxValue = chartData[0].value;

    const formattedMaxValue =
      aggregationType === AggregationType.dealValue
        ? intlStore.formatCurrency(maxValue)
        : intlStore.formatNumber(maxValue);
    const right = reverseXAxis ? 0 : Math.max(formattedMaxValue.length * 5.5, 30);
    const left = reverseXAxis ? Math.max(formattedMaxValue.length * 5.5, 30) : 0;

    return (
      <ResponsiveContainer height="100%" width="100%">
        <BarChart data={chartData} layout="vertical" margin={{ right, left }}>
          <XAxis
            hide
            domain={[0, "dataMax"]}
            padding={{ right: 1, left: 1 }}
            reversed={Boolean(reverseXAxis)}
            type="number"
          />

          <YAxis hide dataKey="label" reversed={Boolean(reverseYAxis)} type="category" />

          <XChartTooltip aggregationType={aggregationType} />

          <Bar dataKey="value" radius={4}>
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.fill} stroke={entry.strokeColor} strokeWidth={1.5} />
            ))}

            <LabelList
              content={(props) => {
                const { x, y, height, value, index } = props;
                const entry = chartData[index as number];
                return (
                  <text
                    dominantBaseline="middle"
                    fill={entry.labelColor}
                    fontFamily="Inter"
                    fontSize={12}
                    textAnchor="start"
                    x={Number(x) + 4}
                    y={Number(y) + Number(height) / 2 + 1}
                  >
                    {value}
                  </text>
                );
              }}
              dataKey="label"
            />

            <LabelList
              dataKey="value"
              formatter={(value) => {
                const numValue = typeof value === "number" ? value : Number(value) || 0;
                return aggregationType === AggregationType.dealValue
                  ? intlStore.formatCurrency(numValue)
                  : intlStore.formatNumber(numValue);
              }}
              position="right"
              style={{
                fill: textColor,
                fontSize: 12,
                fontFamily: "Inter",
              }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );
  },
);
