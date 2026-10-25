import type { ChartDataPoint } from "./chart.types";
import type { KeyboardEvent, MouseEvent } from "react";

import { WIDGET_INTERACTIVE_ATTRIBUTE } from "./widget-interaction";

export function chartPointAction(point: ChartDataPoint) {
  if (!point.onSelect) return {};
  return {
    [WIDGET_INTERACTIVE_ATTRIBUTE]: "true",
    "data-chart-point": point.label,
    role: "button",
    tabIndex: 0,
    "aria-label": `${point.label}: ${point.formattedValue ?? point.value}`,
    className: "cursor-pointer outline-none focus-visible:stroke-foreground focus-visible:stroke-2",
    onClick: (event: MouseEvent<SVGElement | HTMLElement>) => {
      event.stopPropagation();
      point.onSelect?.();
    },
    onKeyDown: (event: KeyboardEvent<SVGElement | HTMLElement>) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      event.stopPropagation();
      point.onSelect?.();
    },
  };
}
