import type { RecordWidgetReader } from "./record-widget-reader";
import { randomUUID } from "node:crypto";

import type { RecordRepo } from "@/features/records/record.repo";
import type { RecordAccessPolicy } from "@/features/records/record-access";
import type { QueryRecordMeasureInteractor } from "@/features/records/query-record-measure.interactor";
import type {
  RecordWidgetInput,
  RecordWidgetDto,
  SavedRecordWidgetInput,
  StoredRecordWidget,
} from "./record-widget.schema";
import type { Validated } from "@/core/validation/validation.utils";
import type { RecordWidgetStoreRepo } from "./record-widget-store.repo";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { fail, failAuthorization, failConflict, failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { recordRequestHash } from "@/features/records/record-request-hash";
import { RecordWidgetInputSchema } from "./record-widget.schema";
import { widgetDisplayTypeIssue } from "./widget-display-rules";
import { resolveDashboardView, resolveWidgetLayout } from "./widget-placement";
import type { DataViewStateRepo } from "@/core/data-view/data-view-state.repo";

function completeChart(input: RecordWidgetInput, current: StoredRecordWidget | null): SavedRecordWidgetInput | null {
  const name = input.name ?? current?.name;
  const measure = input.measure ?? current?.measure;
  const displayOptions = input.displayOptions ?? current?.displayOptions;
  if (name === undefined || measure === undefined || displayOptions === undefined) return null;
  return { ...input, name, measure, displayOptions, isTemplate: input.isTemplate ?? current?.isTemplate ?? false };
}

@TenantInteractor()
export class UpsertRecordWidgetInteractor extends AuthenticatedInteractor<RecordWidgetInput, RecordWidgetDto> {
  constructor(
    private widgets: RecordWidgetStoreRepo,
    private records: RecordRepo,
    private policy: RecordAccessPolicy,
    private measures: QueryRecordMeasureInteractor,
    private reader: RecordWidgetReader,
    private views: DataViewStateRepo,
  ) {
    super();
  }

  @Validate(RecordWidgetInputSchema)
  async invoke(input: RecordWidgetInput): Validated<RecordWidgetDto> {
    return runInTransaction(
      async () => {
        const policy = await this.policy.load();
        if (!policy.actor) return failAuthorization(CustomErrorCode.permissionDenied);
        const hash = recordRequestHash({ operation: "record-widget", input });
        const receipt = await this.records.receipt(input.idempotencyKey, this.userId);
        if (receipt) {
          if (receipt.requestHash !== hash) return failConflict(CustomErrorCode.recordIdempotencyConflict);
          const saved = receipt.result as { widgetId?: string };
          const row = saved.widgetId ? await this.widgets.findOwnedRecordWidget("chart", saved.widgetId) : null;
          if (!row) return failNotFound(CustomErrorCode.widgetNotFound);
          return { ok: true as const, data: await this.reader.read(row) };
        }
        const state = await this.records.getState();
        if (state?.activeOperationId) return failConflict(CustomErrorCode.recordWritePaused);
        if (state?.revision !== input.expectedRevision) return failConflict(CustomErrorCode.recordSchemaChanged);
        const current = input.id ? await this.widgets.findOwnedRecordWidget("chart", input.id) : null;
        if (input.id) {
          if (!current) return failNotFound(CustomErrorCode.widgetNotFound);
          if (current.version !== input.expectedVersion) return failConflict(CustomErrorCode.recordVersionChanged);
        }
        const widget = completeChart(input, current);
        if (!widget) return fail(CustomErrorCode.widgetNotFound, ["id"]);
        const data = await this.measures.invoke(widget.measure);
        if (!data.ok) return data;
        if (widgetDisplayTypeIssue(widget.displayOptions.displayType, widget.measure, await this.records.getModel()))
          return fail(CustomErrorCode.widgetDisplayTypeUnsupported, ["displayOptions", "displayType"]);
        const id = input.id ?? randomUUID();
        const view = await resolveDashboardView(this.views, input.viewId, current ? current.viewId : undefined);
        if (!view.ok) return failNotFound(CustomErrorCode.dataViewNotFound, ["viewId"]);
        const placement = resolveWidgetLayout({
          id,
          kind: "chart",
          displayType: widget.displayOptions.displayType,
          requested: input.layout,
          needsPlacement: !current || current.viewId !== view.viewId,
          widgets: await this.widgets.listLayoutPlacements(view.viewId),
        });
        if (!placement.ok) return fail(placement.code, ["layout"]);
        const row = await this.widgets.saveRecordWidget("chart", widget, id, view.viewId, placement.layout);
        await this.records.saveReceipt(input.idempotencyKey, this.userId, hash, { widgetId: row.id });
        return { ok: true as const, data: await this.reader.read(row) };
      },
      { timeout: 30000 },
    );
  }
}
