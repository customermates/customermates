import type { DataViewStateRepo } from "@/core/data-view/data-view-state.repo";
import type { Validated } from "@/core/validation/validation.utils";
import type { RecordAccessPolicy } from "@/features/records/record-access";
import type { RecordModel } from "@/features/records/record-model.schema";
import type { RecordRepo } from "@/features/records/record.repo";
import type {
  CalendarWidgetQuery,
  RecordCalendarWidgetDto,
  RecordCalendarWidgetInput,
} from "./record-calendar-widget.schema";
import type { MapWidgetQuery, RecordMapWidgetDto, RecordMapWidgetInput } from "./record-map-widget.schema";
import type { RecordWidgetStoreRepo, SavedRecordWidgetOf, StoredRecordWidgetOf } from "./record-widget-store.repo";

import { randomUUID } from "node:crypto";

import { fail, failAuthorization, failConflict, failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { recordRequestHash } from "@/features/records/record-request-hash";

import { resolveDashboardView, resolveWidgetLayout } from "./widget-placement";

type QueryWidgetTypes = {
  calendar: { query: CalendarWidgetQuery; input: RecordCalendarWidgetInput; dto: RecordCalendarWidgetDto };
  map: { query: MapWidgetQuery; input: RecordMapWidgetInput; dto: RecordMapWidgetDto };
};
type QueryWidgetKind = keyof QueryWidgetTypes;
type Query<K extends QueryWidgetKind> = QueryWidgetTypes[K]["query"];
type Dto<K extends QueryWidgetKind> = QueryWidgetTypes[K]["dto"];

export type QueryWidgetDeps = {
  widgets: RecordWidgetStoreRepo;
  records: RecordRepo;
  policy: RecordAccessPolicy;
  views: DataViewStateRepo;
  userId: string;
};

export type QueryWidgetReader<K extends QueryWidgetKind> = {
  read(row: StoredRecordWidgetOf[K]): Promise<Dto<K>>;
  preview(query: Query<K>): Validated<{ data: NonNullable<Dto<K>["data"]>; fields: Dto<K>["fields"] }>;
};

function queryOf<K extends QueryWidgetKind>(widget: object | null, key: `${K}Query`) {
  return (widget as Partial<Record<string, Query<K>>> | null)?.[key];
}

function completeQueryWidget<K extends QueryWidgetKind>(
  key: `${K}Query`,
  input: QueryWidgetTypes[K]["input"],
  current: StoredRecordWidgetOf[K] | null,
): { widget: SavedRecordWidgetOf[K]; query: Query<K> } | null {
  const name = input.name ?? current?.name;
  const query = queryOf<K>(input, key) ?? queryOf<K>(current, key);
  if (name === undefined || query === undefined) return null;
  const widget = {
    ...input,
    name,
    [key]: query,
    displayOptions: input.displayOptions ?? current?.displayOptions ?? { showFilters: true },
    isTemplate: input.isTemplate ?? current?.isTemplate ?? false,
  } as SavedRecordWidgetOf[K];
  return { widget, query };
}

export async function upsertQueryWidget<K extends QueryWidgetKind>(
  deps: QueryWidgetDeps,
  kind: K,
  input: QueryWidgetTypes[K]["input"],
  reader: QueryWidgetReader<K>,
  queryIssue: (query: Query<K>, model: RecordModel) => { code: CustomErrorCode; path: string[] } | null,
): Validated<Dto<K>> {
  const key = `${kind}Query` as const;
  const policy = await deps.policy.load();
  if (!policy.actor) return failAuthorization(CustomErrorCode.permissionDenied);
  const hash = recordRequestHash({ operation: `${kind}-widget`, input });
  const receipt = await deps.records.receipt(input.idempotencyKey, deps.userId);
  if (receipt) {
    if (receipt.requestHash !== hash) return failConflict(CustomErrorCode.recordIdempotencyConflict);
    const saved = receipt.result as { widgetId?: string };
    const row = saved.widgetId ? await deps.widgets.findOwnedRecordWidget(kind, saved.widgetId) : null;
    if (!row) return failNotFound(CustomErrorCode.widgetNotFound);
    return { ok: true as const, data: await reader.read(row) };
  }
  const state = await deps.records.getState();
  if (state?.activeOperationId) return failConflict(CustomErrorCode.recordWritePaused);
  if ((state?.revision ?? 0) !== input.expectedRevision) return failConflict(CustomErrorCode.recordSchemaChanged);
  const current = input.id ? await deps.widgets.findOwnedRecordWidget(kind, input.id) : null;
  if (input.id) {
    if (!current) return failNotFound(CustomErrorCode.widgetNotFound);
    if (current.version !== input.expectedVersion) return failConflict(CustomErrorCode.recordVersionChanged);
  }
  const completed = completeQueryWidget(key, input, current);
  if (!completed) return fail(CustomErrorCode.widgetNotFound, ["id"]);
  const { widget, query } = completed;
  const model = await deps.records.getModel();
  if (
    !model.types.some((type) => type.id === query.source.typeId && !type.archived) ||
    !policy.canReadType(query.source.typeId)
  )
    return failNotFound(CustomErrorCode.recordTypeNotFound, [key, "source", "typeId"]);
  const issue = queryIssue(query, model);
  if (issue) return fail(issue.code, issue.path);
  const preview = await reader.preview(query);
  if (!preview.ok) return preview;
  const id = input.id ?? randomUUID();
  const view = await resolveDashboardView(deps.views, input.viewId, current ? current.viewId : undefined);
  if (!view.ok) return failNotFound(CustomErrorCode.dataViewNotFound, ["viewId"]);
  const placement = resolveWidgetLayout({
    id,
    kind,
    requested: input.layout,
    needsPlacement: !current || current.viewId !== view.viewId,
    widgets: await deps.widgets.listLayoutPlacements(view.viewId),
  });
  if (!placement.ok) return fail(placement.code, ["layout"]);
  const row = await deps.widgets.saveRecordWidget(kind, widget, id, view.viewId, placement.layout);
  await deps.records.saveReceipt(input.idempotencyKey, deps.userId, hash, { widgetId: row.id });
  const dto: unknown = { ...row, status: "ready", data: preview.data.data, fields: preview.data.fields };
  return { ok: true as const, data: dto as Dto<K> };
}
