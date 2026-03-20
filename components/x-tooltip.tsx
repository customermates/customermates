"use client";

import type { TooltipProps } from "@heroui/tooltip";

import { Tooltip } from "@heroui/tooltip";

type Props = TooltipProps & {
  delay?: number;
};

export function XTooltip({ delay = 500, ...props }: Props) {
  return <Tooltip delay={delay} {...props} />;
}
