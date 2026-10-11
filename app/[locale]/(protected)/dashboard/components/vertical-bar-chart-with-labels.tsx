"use client";

import type { ChartDataPoint } from "./chart.types";

import { Bar, BarChart, Cell, LabelList, XAxis, YAxis } from "recharts";
import { observer } from "mobx-react-lite";
import { useReducedMotion } from "framer-motion";

import { useChartFormatter } from "./use-chart-formatter";
import { ChartTooltip } from "@/components/chart/chart-tooltip";

import {
  CHART_FONT_SIZE,
  CHART_MAX_BAR_SIZE,
  TruncatedTick,
  chartAxisProps,
  chartBarCursor,
  displayOrder,
  estimateTextWidth,
  useCategoryXAxisLayout,
} from "./chart-theme";
import { DashboardChartContainer } from "./dashboard-chart-container";

type Props = {
  currency?: string | null;
  chartData: ChartDataPoint[];
  colors: string[];
  reverseXAxis?: boolean;
  reverseYAxis?: boolean;
};

export const VerticalBarChartWithLabels = observer(
  ({ currency, chartData, colors, reverseXAxis, reverseYAxis }: Props) => {
    const formatValue = useChartFormatter(currency);
    const reducedMotion = useReducedMotion();
    const axis = useCategoryXAxisLayout(
      displayOrder(
        chartData.map((entry) => entry.label),
        reverseXAxis,
      ),
      8,
    );

    return (
      <DashboardChartContainer onResize={axis.onResize}>
        <BarChart
          barCategoryGap="24%"
          data={chartData}
          margin={{
            top: reverseYAxis ? 0 : 20,
            right: axis.angled ? 8 : 4,
            bottom: reverseYAxis ? 20 : 0,
            left: Math.max(4, axis.overhang),
          }}
        >
          <XAxis
            {...chartAxisProps}
            dataKey="label"
            height={axis.height}
            interval={axis.interval}
            orientation={reverseYAxis ? "top" : "bottom"}
            reversed={Boolean(reverseXAxis)}
            tick={<TruncatedTick angled={axis.angled} flipped={Boolean(reverseYAxis)} />}
            type="category"
          />

          <YAxis
            hide
            domain={[(minimum: number) => Math.min(0, minimum), (maximum: number) => Math.max(0, maximum)]}
            reversed={Boolean(reverseYAxis)}
            type="number"
          />

          <ChartTooltip currency={currency} cursor={chartBarCursor} />

          <Bar
            dataKey="value"
            fill={colors[0]}
            isAnimationActive={reducedMotion === false}
            maxBarSize={CHART_MAX_BAR_SIZE * 1.5}
            radius={reverseYAxis ? [0, 0, 4, 4] : [4, 4, 0, 0]}
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.fill} />
            ))}

            <LabelList
              content={(props) => {
                const { x, width, y, height, index } = props;
                const entry = chartData[index as number];
                if (!entry) return null;
                const full = entry.formattedValue ?? formatValue(entry.value);
                const room = Number(width) / 0.76 - 2;
                const compact = formatValue(entry.value, true);
                const text = estimateTextWidth(full) <= room ? full : compact;
                if (estimateTextWidth(text) > room) return null;
                const top = reverseYAxis ? Number(y) + Number(height) + 6 : Number(y) - 6;
                const half = estimateTextWidth(text) * 0.55 + 2;
                const center = Number(x) + Number(width) / 2;
                const anchor = axis.width > 2 * half ? Math.min(Math.max(center, half), axis.width - half) : center;
                return (
                  <g>
                    {text !== full && <title>{full}</title>}

                    <text
                      dominantBaseline={reverseYAxis ? "hanging" : "auto"}
                      fill="var(--foreground)"
                      fontSize={CHART_FONT_SIZE}
                      fontWeight={500}
                      textAnchor="middle"
                      x={anchor}
                      y={top}
                    >
                      {text}
                    </text>
                  </g>
                );
              }}
              dataKey="value"
            />
          </Bar>
        </BarChart>
      </DashboardChartContainer>
    );
  },
);
