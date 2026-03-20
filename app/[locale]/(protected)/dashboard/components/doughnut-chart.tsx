"use client";

import type { ChartDataPoint } from "./chart.types";

import { useMemo, useRef, useEffect, useState } from "react";
import { Label, Pie, PieChart, ResponsiveContainer, Cell } from "recharts";
import { observer } from "mobx-react-lite";
import { AggregationType } from "@/generated/prisma";

import { useRootStore } from "@/core/stores/root-store.provider";
import { XChartTooltip } from "@/components/x-chart/chart-tooltip";

type Props = {
  aggregationType?: AggregationType;
  chartData: ChartDataPoint[];
  colors: string[];
  textColor: string;
};

export const DoughnutChart = observer(({ aggregationType, chartData, textColor }: Props) => {
  const { intlStore } = useRootStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const [fontSize, setFontSize] = useState(24);

  const totalValue = useMemo(() => {
    return chartData.reduce((sum, item) => sum + item.value, 0);
  }, [chartData]);

  const formattedTotalValue =
    aggregationType === AggregationType.dealValue
      ? intlStore.formatCurrency(totalValue, undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })
      : intlStore.formatNumber(totalValue);

  useEffect(() => {
    function updateFontSize() {
      const container = containerRef.current;
      if (!container) return;

      const width = container.clientWidth;
      const height = container.clientHeight;
      const size = Math.min(width, height);
      const calculatedFontSize = Math.max(12, Math.min(32, size * 0.12));

      setFontSize(calculatedFontSize);
    }

    updateFontSize();

    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver(updateFontSize);
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  return (
    <div ref={containerRef} className="h-full w-full">
      <ResponsiveContainer height="100%" width="100%">
        <PieChart>
          <XChartTooltip aggregationType={aggregationType} />

          <Pie data={chartData} dataKey="value" innerRadius="75%" nameKey="label" outerRadius="100%">
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.fill} stroke={entry.strokeColor} strokeWidth={1.5} />
            ))}

            <Label
              content={({ viewBox }) => {
                if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                  return (
                    <text dominantBaseline="middle" textAnchor="middle" x={viewBox.cx} y={viewBox.cy}>
                      <tspan style={{ fill: textColor, fontSize }} x={viewBox.cx} y={viewBox.cy}>
                        {formattedTotalValue}
                      </tspan>
                    </text>
                  );
                }
              }}
            />
          </Pie>
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
});
