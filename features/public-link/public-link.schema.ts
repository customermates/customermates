import type { RecordWidgetDto } from "@/features/widget/record-widget.schema";
import type { RecordPresentationResult } from "@/features/records/get-record-presentation.interactor";

import { z } from "zod";

import { FilterSchema, SortDescriptorSchema } from "@/core/base/base-get.schema";
import { DataViewPageSizeSchema } from "@/core/data-view/data-view-state.schema";
import { RecordContributionGroupSchema } from "@/features/records/record-contribution.schema";

export const PUBLIC_LINK_TOKEN_PATTERN = /^[0-9a-f]{64}$/u;

const VisitorFiltersSchema = z.array(FilterSchema).max(20).optional();
const VisitorSearchSchema = z.string().max(200).optional();

const PageSizeSchema = DataViewPageSizeSchema.optional();

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
  .describe("Read, create or revoke the public link of a dashboard or list view you own.");
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
> & { listLabels: { label: string; pluralLabel: string } | null };

export type PublicDashboard = {
  name: string;
  workspaceName: string | null;
  expiresAt: string | null;
  widgets: PublicChartWidget[];
  hiddenWidgetCount: number;
};

export const PublicWidgetRecordsSchema = z
  .object({
    token: z.string().regex(PUBLIC_LINK_TOKEN_PATTERN),
    widget: z.string().regex(/^[0-9a-f]{16}$/u),
    group: RecordContributionGroupSchema.nullable(),
    label: z.string().max(500).nullable(),
    page: z.number().int().min(1).max(10_000).default(1),
    pageSize: PageSizeSchema,
    sortDescriptor: SortDescriptorSchema.optional(),
    filters: VisitorFiltersSchema,
    searchTerm: VisitorSearchSchema,
  })
  .strict();
export type PublicWidgetRecordsInput = z.input<typeof PublicWidgetRecordsSchema>;

export type PublicList = {
  name: string;
  workspaceName: string | null;
  expiresAt: string | null;
  presentation: RecordPresentationResult;
  searchable: boolean;
};

export const PublicListRecordsSchema = z
  .object({
    token: z.string().regex(PUBLIC_LINK_TOKEN_PATTERN),
    page: z.number().int().min(1).max(10_000).default(1),
    pageSize: PageSizeSchema,
    sortDescriptor: SortDescriptorSchema.optional(),
    filters: VisitorFiltersSchema,
    searchTerm: VisitorSearchSchema,
  })
  .strict();
export type PublicListRecordsInput = z.input<typeof PublicListRecordsSchema>;

export type PublicRecordsResult =
  | { status: "available"; presentation: RecordPresentationResult; searchable: boolean }
  | { status: "unavailable" }
  | { status: "rateLimited"; retryAfterSeconds: number };

export type PublicLinkResult =
  | { status: "available"; dashboard: PublicDashboard }
  | { status: "available"; list: PublicList }
  | { status: "unavailable" }
  | { status: "rateLimited"; retryAfterSeconds: number };

export function publicChartWidget(
  widget: RecordWidgetDto,
  key: string,
  listLabels: PublicChartWidget["listLabels"] = null,
): PublicChartWidget {
  const { measure } = widget;
  const dateField = measure.groupBy?.dateInterval ? measure.groupBy.fieldId : null;
  const dateWindow = <T extends { fieldId: string }>(filters: readonly T[] | undefined) =>
    dateField ? (filters ?? []).filter((filter) => filter.fieldId === dateField) : [];
  return {
    id: key,
    listLabels,
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
    data: widget.data,
  };
}
