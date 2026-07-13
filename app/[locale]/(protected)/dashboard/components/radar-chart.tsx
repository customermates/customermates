"use client";

import type { ChartDataPoint } from "./chart.types";

import { PolarAngleAxis, PolarGrid, Radar, RadarChart, ResponsiveContainer } from "recharts";
import { observer } from "mobx-react-lite";

import type { AggregationType } from "@/generated/prisma";

import { ChartTooltip } from "@/components/chart/chart-tooltip";

type Props = {
  aggregationType?: AggregationType;
  chartData: ChartDataPoint[];
  colors: string[];
  textColor: string;
};

export const RadarChartComponent = observer(({ aggregationType, chartData, colors, textColor }: Props) => {
  return (
    <ResponsiveContainer height="100%" width="100%">
      <RadarChart data={chartData}>
        <ChartTooltip aggregationType={aggregationType} />

        <PolarAngleAxis dataKey="label" tick={{ fill: textColor, fontSize: 12, fontFamily: "Inter" }} />

        <PolarGrid opacity={0.2} stroke={textColor} />

        <Radar
          dataKey="value"
          dot={{
            fillOpacity: 1,
            r: 4,
          }}
          fill={colors[0]}
          stroke={chartData[0]?.strokeColor || colors[0]}
          strokeWidth={1.5}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
});
