import type { WidgetLayout } from "@/features/widget/widget.schema";

import { WidgetKind } from "@/generated/prisma";

type PersistedLayoutItem = NonNullable<WidgetLayout["lg"]>;

export type WidgetLayoutGeometry = {
  w: number;
  h: number;
  minW?: number;
  minH?: number;
};

export function widgetLayoutGeometry(
  kind: WidgetKind,
  cols: number,
  persisted?: Pick<PersistedLayoutItem, "w" | "h">,
): WidgetLayoutGeometry {
  if (kind === WidgetKind.chart) {
    return {
      w: Math.min(persisted?.w ?? 4, cols),
      h: persisted?.h ?? 4,
    };
  }

  const minW = Math.min(2, cols);
  const minH = 3;
  const defaultW = Math.min(cols >= 12 ? 6 : 4, cols);

  return {
    w: Math.max(minW, Math.min(persisted?.w ?? defaultW, cols)),
    h: Math.max(minH, persisted?.h ?? 4),
    minW,
    minH,
  };
}
