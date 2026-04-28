"use client";

import type { ChartDataPoint } from "./chart.types";

import { Bar, BarChart, LabelList, XAxis, YAxis, ResponsiveContainer, Cell } from "recharts";
import { observer } from "mobx-react-lite";
import { AggregationType } from "@/generated/prisma";

import { useRootStore } from "@/core/stores/root-store.provider";
import { ChartTooltip } from "@/components/chart/chart-tooltip";

type Props = {
  aggregationType?: AggregationType;
  chartData: ChartDataPoint[];
  colors: string[];
  textColor: string;
  reverseXAxis?: boolean;
  reverseYAxis?: boolean;
};

export const VerticalBarChartWithLabels = observer(
  ({ aggregationType, chartData, colors, textColor, reverseXAxis, reverseYAxis }: Props) => {
    const { intlStore } = useRootStore();

    const top = reverseYAxis ? 0 : 20;
    const bottom = reverseYAxis ? 20 : 0;

    return (
      <ResponsiveContainer height="100%" width="100%">
        <BarChart data={chartData} margin={{ top, bottom }}>
          <XAxis hide dataKey="label" reversed={Boolean(reverseXAxis)} type="category" />

          <YAxis
            hide
            domain={[0, "dataMax"]}
            padding={{ top: 1, bottom: 1 }}
            reversed={Boolean(reverseYAxis)}
            type="number"
          />

          <ChartTooltip aggregationType={aggregationType} />

          <Bar dataKey="value" fill={colors[0]} radius={4}>
            {chartData.map((entry, index) => {
              return <Cell key={`cell-${index}`} fill={entry.fill} stroke={entry.strokeColor} strokeWidth={1.5} />;
            })}

            <LabelList
              content={(props) => {
                const { x, width, y, height, value, index } = props;
                const entry = chartData[index as number];
                if (!entry) return null;
                return (
                  <text
                    dominantBaseline="middle"
                    fill={entry.labelColor}
                    fontFamily="Inter"
                    fontSize={12}
                    textAnchor="middle"
                    x={Number(x) + Number(width) / 2}
                    y={Number(y) + Number(height) - 10}
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
              position="top"
              style={{ fill: textColor, fontSize: 12, fontFamily: "Inter" }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );
  },
);
