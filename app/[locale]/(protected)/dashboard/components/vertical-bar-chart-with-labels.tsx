"use client";

import type { ChartDataPoint } from "./chart.types";

import { Bar, BarChart, LabelList, XAxis, YAxis, Cell } from "recharts";
import { observer } from "mobx-react-lite";
import { useReducedMotion } from "framer-motion";
import type { AggregationType } from "@/generated/prisma";

import { useChartFormatter } from "./use-chart-formatter";
import { ChartTooltip } from "@/components/chart/chart-tooltip";

import { DashboardChartContainer } from "./dashboard-chart-container";

type Props = {
  aggregationType?: AggregationType;
  currency?: string | null;
  chartData: ChartDataPoint[];
  colors: string[];
  textColor: string;
  reverseXAxis?: boolean;
  reverseYAxis?: boolean;
};

export const VerticalBarChartWithLabels = observer(
  ({ aggregationType, currency, chartData, colors, textColor, reverseXAxis, reverseYAxis }: Props) => {
    const formatValue = useChartFormatter(aggregationType, currency);
    const reducedMotion = useReducedMotion();

    const top = reverseYAxis ? 0 : 20;
    const bottom = reverseYAxis ? 20 : 0;

    return (
      <DashboardChartContainer>
        <BarChart data={chartData} margin={{ top, bottom }}>
          <XAxis hide dataKey="label" reversed={Boolean(reverseXAxis)} type="category" />

          <YAxis
            hide
            domain={[(minimum: number) => Math.min(0, minimum), (maximum: number) => Math.max(0, maximum)]}
            padding={{ top: 1, bottom: 1 }}
            reversed={Boolean(reverseYAxis)}
            type="number"
          />

          <ChartTooltip aggregationType={aggregationType} currency={currency} />

          <Bar dataKey="value" fill={colors[0]} isAnimationActive={reducedMotion === false} radius={4}>
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
              dataKey={chartData.some((entry) => entry.formattedValue !== undefined) ? "formattedValue" : "value"}
              formatter={(value) => {
                if (typeof value === "string") return value;
                const numValue = typeof value === "number" ? value : Number(value) || 0;
                return formatValue(numValue);
              }}
              position="top"
              style={{ fill: textColor, fontSize: 12 }}
            />
          </Bar>
        </BarChart>
      </DashboardChartContainer>
    );
  },
);
