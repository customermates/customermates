"use client";

import type { ComponentProps } from "react";

import { ResponsiveContainer } from "recharts";

type Props = ComponentProps<typeof ResponsiveContainer>;

const INITIAL_DIMENSION = { height: 1, width: 1 };

export function DashboardChartContainer(props: Omit<Props, "height" | "initialDimension" | "width">) {
  return <ResponsiveContainer {...props} height="100%" initialDimension={INITIAL_DIMENSION} width="100%" />;
}
