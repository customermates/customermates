import type { AppPrismaClient } from "@/prisma/db";
import type { WidgetLayout } from "./widget-display.schema";
import type { DisplayType } from "./widget-display.schema";
import type { WidgetPlacement } from "./widget-grid";

import { CustomErrorCode } from "@/core/validation/validation.types";
import { WidgetLayoutSchema } from "./widget-display.schema";
import { placeWidget, withLargePlacement } from "./widget-grid";

export type WidgetPlacementRow = { id: string; kind: "chart" | "activityTimeline"; layout: WidgetLayout | null };

export async function listWidgetPlacements(
  prisma: Pick<AppPrismaClient, "widget">,
  companyId: string,
  userId: string,
): Promise<WidgetPlacementRow[]> {
  const rows = await prisma.widget.findMany({
    where: { companyId, userId },
    select: { id: true, kind: true, layout: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  return rows.map((row) => {
    const layout = WidgetLayoutSchema.safeParse(row.layout);
    return { id: row.id, kind: row.kind, layout: layout.success ? layout.data : null };
  });
}

export function resolveWidgetLayout(args: {
  id: string;
  kind: "chart" | "activityTimeline";
  displayType?: DisplayType;
  requested?: WidgetPlacement;
  isCreate: boolean;
  widgets: WidgetPlacementRow[];
}) {
  if (!args.requested && !args.isCreate) return { ok: true as const, layout: undefined };
  const placed = placeWidget(args);
  if (!placed.ok) {
    return {
      ok: false as const,
      code: placed.reason === "overlap" ? CustomErrorCode.widgetLayoutOverlap : CustomErrorCode.widgetLayoutTooSmall,
    };
  }
  const current = args.widgets.find((widget) => widget.id === args.id)?.layout ?? null;
  return { ok: true as const, layout: withLargePlacement(args.id, current, placed.placement) };
}
