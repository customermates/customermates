import type { AppPrismaClient } from "@/prisma/db";
import type { DataViewStateRepo } from "@/core/data-view/data-view-state.repo";
import type { WidgetLayout } from "./widget-display.schema";
import type { DisplayType } from "./widget-display.schema";
import type { WidgetPlacement } from "./widget-grid";

import { CustomErrorCode } from "@/core/validation/validation.types";
import { SURFACE } from "@/core/data-view/data-view-keys";
import { WidgetLayoutSchema } from "./widget-display.schema";
import { placeWidget, withLargePlacement } from "./widget-grid";

export type WidgetPlacementRow = { id: string; kind: "chart" | "activityTimeline"; layout: WidgetLayout | null };

export async function listWidgetPlacements(
  prisma: Pick<AppPrismaClient, "widget">,
  companyId: string,
  userId: string,
  viewId: string | null,
): Promise<WidgetPlacementRow[]> {
  const rows = await prisma.widget.findMany({
    where: { companyId, userId, viewId },
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
  needsPlacement: boolean;
  widgets: WidgetPlacementRow[];
}) {
  if (!args.requested && !args.needsPlacement) return { ok: true as const, layout: undefined };
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

export async function resolveDashboardView(
  views: DataViewStateRepo,
  requested: string | null | undefined,
  current?: string | null,
): Promise<{ ok: true; viewId: string | null } | { ok: false }> {
  if (requested === undefined && current !== undefined) return { ok: true, viewId: current };
  const surface = await views.loadSurfaceState(SURFACE.dashboard);
  const readable = new Set(surface.views.map((view) => view.id));
  if (requested === undefined) {
    const active = surface.activeViewKey;
    return { ok: true, viewId: active && readable.has(active) ? active : null };
  }
  return requested === null || readable.has(requested) ? { ok: true, viewId: requested } : { ok: false };
}
