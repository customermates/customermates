"use client";

import type { ChartDataPoint } from "./chart.types";

import { Cell, Pie, PieChart } from "recharts";
import { observer } from "mobx-react-lite";
import { useReducedMotion } from "framer-motion";

import { ChartTooltip } from "@/components/chart/chart-tooltip";

import { useChartFormatter } from "./use-chart-formatter";
import { DashboardChartContainer } from "./dashboard-chart-container";

type Props = {
  currency?: string | null;
  chartData: ChartDataPoint[];
  showLegend?: boolean;
};

export const DoughnutChart = observer(({ currency, chartData, showLegend = true }: Props) => {
  const reducedMotion = useReducedMotion();
  const formatValue = useChartFormatter(currency);
  const total = chartData.reduce((sum, entry) => sum + entry.value, 0);
  const slices = chartData.filter((entry) => entry.value > 0).length;

  return (
    <div className="flex size-full min-h-0 flex-col gap-3 overflow-hidden">
      <div className="relative min-h-0 flex-1">
        <DashboardChartContainer>
          <PieChart>
            <ChartTooltip currency={currency} />

            <Pie
              cornerRadius={4}
              data={chartData}
              dataKey="value"
              innerRadius="72%"
              isAnimationActive={reducedMotion === false}
              nameKey="label"
              outerRadius="100%"
              paddingAngle={slices > 1 ? 2 : 0}
              stroke="var(--background)"
              strokeWidth={2}
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.fill} />
              ))}
            </Pie>
          </PieChart>
        </DashboardChartContainer>

        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
          data-slot="doughnut-total"
        >
          <span className="max-w-[55%] truncate text-sm font-semibold tabular-nums text-foreground">
            {formatValue(total, true)}
          </span>
        </div>
      </div>

      {showLegend && (
        <ul className="flex max-h-[40%] min-w-0 shrink-0 flex-wrap justify-center gap-x-3 gap-y-1 overflow-hidden">
          {chartData.map((entry, index) => (
            <li key={index} className="flex min-w-0 max-w-full items-center gap-1.5 text-xs" title={entry.label}>
              <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: entry.fill }} />

              <span className="min-w-0 truncate text-muted-foreground">{entry.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});
