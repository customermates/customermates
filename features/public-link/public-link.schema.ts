import type { RecordWidgetDto } from "@/features/widget/record-widget.schema";

import { z } from "zod";

export const PUBLIC_LINK_TOKEN_PATTERN = /^[0-9a-f]{64}$/u;

export const ManagePublicLinkSchema = z
  .discriminatedUnion("action", [
    z.object({ action: z.literal("read"), viewId: z.uuid() }).strict(),
    z
      .object({
        action: z.literal("publish"),
        viewId: z.uuid(),
        expiresAt: z.iso.date().nullable().optional(),
      })
      .strict(),
    z.object({ action: z.literal("revoke"), viewId: z.uuid() }).strict(),
  ])
  .describe("Read, create or revoke the public link of a dashboard view you own.");
export type ManagePublicLinkData = z.infer<typeof ManagePublicLinkSchema>;

export const PublicLinkStatusSchema = z
  .object({
    allowed: z.boolean().describe("False when the workspace turned public links off or your role may not publish."),
    reason: z.enum(["workspaceDisabled", "permissionDenied"]).nullable(),
    link: z
      .object({
        url: z.string(),
        expiresAt: z.iso.date().nullable(),
        openCount: z.number().int(),
        lastOpenedAt: z.string().nullable(),
        createdAt: z.string(),
      })
      .strict()
      .nullable(),
  })
  .strict();
export type PublicLinkStatus = z.infer<typeof PublicLinkStatusSchema>;

export type PublicChartWidget = Pick<
  RecordWidgetDto,
  "id" | "name" | "data" | "groupOptions" | "displayOptions" | "measure" | "status" | "decimalPlaces" | "layout"
>;

export type PublicDashboard = {
  name: string;
  workspaceName: string | null;
  expiresAt: string | null;
  widgets: PublicChartWidget[];
  hiddenWidgetCount: number;
};

export type PublicDashboardResult =
  | { status: "available"; dashboard: PublicDashboard }
  | { status: "unavailable" }
  | { status: "rateLimited"; retryAfterSeconds: number };

export function publicChartWidget(widget: RecordWidgetDto, index: number): PublicChartWidget {
  const { measure } = widget;
  const dateField = measure.groupBy?.dateInterval ? measure.groupBy.fieldId : null;
  const dateWindow = <T extends { fieldId: string }>(filters: readonly T[] | undefined) =>
    dateField ? (filters ?? []).filter((filter) => filter.fieldId === dateField) : [];
  return {
    id: `widget-${index + 1}`,
    name: widget.name,
    status: widget.status,
    decimalPlaces: widget.decimalPlaces ?? null,
    displayOptions: widget.displayOptions,
    layout: widget.layout,
    groupOptions: widget.groupOptions.map(({ id, label, color }) => ({ id, label, color })),
    measure: {
      ...measure,
      source: {
        typeId: measure.source.typeId,
        filters: measure.groupBy?.path.length ? [] : dateWindow(measure.source.filters),
        relationships: [],
      },
      groupBy: measure.groupBy
        ? {
            ...measure.groupBy,
            filter: measure.groupBy.filter
              ? { filters: dateWindow(measure.groupBy.filter.filters), relationships: [] }
              : undefined,
          }
        : measure.groupBy,
    } as RecordWidgetDto["measure"],
    data: widget.data
      ? { ...widget.data, groups: widget.data.groups.map((group) => ({ ...group, record: null })) }
      : null,
  };
}
