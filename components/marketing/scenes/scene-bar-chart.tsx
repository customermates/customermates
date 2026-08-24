"use client";

import { Bar, BarChart, Cell, LabelList, XAxis, YAxis } from "recharts";

import { getChartColors, getChartStrokeColors, getChartTextColors } from "@/constants/chart-colors";
import type { ChartColor } from "@/features/widget/widget.schema";

export type SceneBar = {
  color: ChartColor;
  label: string;
  value: number;
  valueLabel: string;
};

const CHAR_WIDTH = 7;

const LABEL_PADDING = 4;

const AXIS_FONT = { fontSize: 12 };

function truncateToWidth(text: string, maxWidth: number) {
  if (maxWidth <= CHAR_WIDTH) return "…";
  const maxChars = Math.max(1, Math.floor(maxWidth / CHAR_WIDTH));
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(1, maxChars - 1))}…`;
}

export function SceneBarChart({ bars, height, width }: { bars: SceneBar[]; height: number; width: number }) {
  const fills = getChartColors(undefined);
  const strokes = getChartStrokeColors(undefined);
  const inks = getChartTextColors(undefined);

  const widest = bars.reduce((longest, bar) => Math.max(longest, bar.valueLabel.length), 0);
  const valueMargin = widest * CHAR_WIDTH + LABEL_PADDING * 2;

  return (
    <BarChart data={bars} height={height} layout="vertical" margin={{ left: 0, right: valueMargin }} width={width}>
      <XAxis hide domain={[0, "dataMax"]} padding={{ left: 1, right: 1 }} type="number" />

      <YAxis hide dataKey="label" type="category" />

      <Bar dataKey="value" isAnimationActive={false} radius={4}>
        {bars.map((bar) => (
          <Cell key={bar.label} fill={fills[bar.color]} stroke={strokes[bar.color]} strokeWidth={1.5} />
        ))}

        <LabelList
          content={({ height: barHeight, index, width: barWidth, x, y }) => {
            const bar = bars[Number(index)];
            if (!bar) return null;

            const available = Number(barWidth) - LABEL_PADDING * 2;
            if (available <= CHAR_WIDTH) return null;

            return (
              <text
                dominantBaseline="central"
                fill={inks[bar.color]}
                x={Number(x) + LABEL_PADDING}
                y={Number(y) + Number(barHeight) / 2}
                {...AXIS_FONT}
              >
                {truncateToWidth(bar.label, available)}
              </text>
            );
          }}
          dataKey="label"
        />

        <LabelList dataKey="valueLabel" fill="var(--muted-foreground)" position="right" {...AXIS_FONT} />
      </Bar>
    </BarChart>
  );
}
