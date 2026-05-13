"use client";

import type { ChartDataPoint } from "./chart.types";

import { Pie, PieChart, ResponsiveContainer, Cell } from "recharts";
import { observer } from "mobx-react-lite";
import type { AggregationType } from "@/generated/prisma";

import { ChartTooltip } from "@/components/chart/chart-tooltip";

type Props = {
  aggregationType?: AggregationType;
  chartData: ChartDataPoint[];
  colors: string[];
  textColor: string;
  showLegend?: boolean;
};

export const DoughnutChart = observer(({ aggregationType, chartData, showLegend = true }: Props) => {
  return (
    <div className="flex size-full flex-col gap-3 min-h-0 overflow-hidden">
      <div className="flex-1 min-h-0">
        <ResponsiveContainer height="100%" width="100%">
          <PieChart>
            <ChartTooltip aggregationType={aggregationType} />

            <Pie data={chartData} dataKey="value" innerRadius="75%" nameKey="label" outerRadius="100%">
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.fill} stroke={entry.strokeColor} strokeWidth={1.5} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>

      {showLegend && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 shrink-0 min-w-0 max-h-[40%] overflow-hidden">
          {chartData.map((entry, index) => (
            <div key={index} className="flex items-center gap-1.5 text-xs min-w-0 max-w-full">
              <div className="size-2 rounded-sm shrink-0" style={{ backgroundColor: entry.fill }} />

              <span className="text-muted-foreground truncate min-w-0">{entry.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
