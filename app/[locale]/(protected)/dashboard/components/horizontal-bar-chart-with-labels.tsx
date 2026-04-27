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
  textColor: string;
  reverseXAxis?: boolean;
  reverseYAxis?: boolean;
};

const CHAR_WIDTH = 7;
const LABEL_PADDING_LEFT = 4;
const LABEL_PADDING_RIGHT = 4;

function truncateToWidth(text: string, maxWidth: number) {
  if (maxWidth <= CHAR_WIDTH) return "…";
  const maxChars = Math.max(1, Math.floor(maxWidth / CHAR_WIDTH));
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(1, maxChars - 1))}…`;
}

export const HorizontalBarChartWithLabels = observer(
  ({ aggregationType, chartData, textColor, reverseXAxis, reverseYAxis }: Props) => {
    const { intlStore } = useRootStore();

    const formatValue = (value: number) =>
      aggregationType === AggregationType.dealValue ? intlStore.formatCurrency(value) : intlStore.formatNumber(value);

    const maxValue = chartData[0].value;
    const formattedMaxValue = formatValue(maxValue);

    const valueMargin = Math.max(formattedMaxValue.length * CHAR_WIDTH + 12, 56);
    const right = reverseXAxis ? 0 : valueMargin;
    const left = reverseXAxis ? valueMargin : 0;

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

          <ChartTooltip aggregationType={aggregationType} />

          <Bar dataKey="value" radius={4}>
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.fill} stroke={entry.strokeColor} strokeWidth={1.5} />
            ))}

            <LabelList
              content={(props) => {
                const { x, y, height, width, value, index } = props;
                const entry = chartData[index as number];
                const text = String(value ?? "");
                const available = Number(width) - LABEL_PADDING_LEFT - LABEL_PADDING_RIGHT;
                const display = truncateToWidth(text, available);
                return (
                  <text
                    dominantBaseline="middle"
                    fill={entry.labelColor}
                    fontFamily="Inter"
                    fontSize={12}
                    textAnchor="start"
                    x={Number(x) + LABEL_PADDING_LEFT}
                    y={Number(y) + Number(height) / 2 + 1}
                  >
                    <title>{text}</title>

                    {display}
                  </text>
                );
              }}
              dataKey="label"
            />

            <LabelList
              dataKey="value"
              formatter={(value) => {
                const numValue = typeof value === "number" ? value : Number(value) || 0;
                return formatValue(numValue);
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
