import type { RecordCalendarWidgetReader } from "./record-calendar-widget-reader";
import { randomUUID } from "node:crypto";
import type { RecordRepo } from "@/features/records/record.repo";
import type { RecordAccessPolicy } from "@/features/records/record-access";
import type {
  RecordCalendarWidgetInput,
  RecordCalendarWidgetDto,
  SavedRecordCalendarWidgetInput,
  StoredRecordCalendarWidget,
} from "./record-calendar-widget.schema";
import type { Validated } from "@/core/validation/validation.utils";
import type { RecordWidgetStoreRepo } from "./record-widget-store.repo";
import type { DataViewStateRepo } from "@/core/data-view/data-view-state.repo";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { fail, failAuthorization, failConflict, failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { recordRequestHash } from "@/features/records/record-request-hash";
import { RecordCalendarWidgetInputSchema } from "./record-calendar-widget.schema";
import { calendarWidgetQueryIssue } from "./record-widget-query-validation";
import { resolveDashboardView, resolveWidgetLayout } from "./widget-placement";

function completeCalendar(
  input: RecordCalendarWidgetInput,
  current: StoredRecordCalendarWidget | null,
): SavedRecordCalendarWidgetInput | null {
  const name = input.name ?? current?.name;
  const calendarQuery = input.calendarQuery ?? current?.calendarQuery;
  if (name === undefined || calendarQuery === undefined) return null;
  return {
    ...input,
    name,
    calendarQuery,
    displayOptions: input.displayOptions ?? current?.displayOptions ?? { showFilters: true },
    isTemplate: input.isTemplate ?? current?.isTemplate ?? false,
  };
}

@TenantInteractor()
export class UpsertRecordCalendarWidgetInteractor extends AuthenticatedInteractor<
  RecordCalendarWidgetInput,
  RecordCalendarWidgetDto
> {
  constructor(
    private widgets: RecordWidgetStoreRepo,
    private records: RecordRepo,
    private policy: RecordAccessPolicy,
    private reader: RecordCalendarWidgetReader,
    private views: DataViewStateRepo,
  ) {
    super();
  }

  @Validate(RecordCalendarWidgetInputSchema)
  async invoke(input: RecordCalendarWidgetInput): Validated<RecordCalendarWidgetDto> {
    return runInTransaction(
      async () => {
        const policy = await this.policy.load();
        if (!policy.actor) return failAuthorization(CustomErrorCode.permissionDenied);
        const hash = recordRequestHash({ operation: "calendar-widget", input });
        const receipt = await this.records.receipt(input.idempotencyKey, this.userId);
        if (receipt) {
          if (receipt.requestHash !== hash) return failConflict(CustomErrorCode.recordIdempotencyConflict);
          const saved = receipt.result as { widgetId?: string };
          const row = saved.widgetId ? await this.widgets.findOwnedRecordWidget("calendar", saved.widgetId) : null;
          if (!row) return failNotFound(CustomErrorCode.widgetNotFound);
          return { ok: true as const, data: await this.reader.read(row) };
        }
        const state = await this.records.getState();
        if (state?.activeOperationId) return failConflict(CustomErrorCode.recordWritePaused);
        if (state?.revision !== input.expectedRevision) return failConflict(CustomErrorCode.recordSchemaChanged);
        const current = input.id ? await this.widgets.findOwnedRecordWidget("calendar", input.id) : null;
        if (input.id) {
          if (!current) return failNotFound(CustomErrorCode.widgetNotFound);
          if (current.version !== input.expectedVersion) return failConflict(CustomErrorCode.recordVersionChanged);
        }
        const widget = completeCalendar(input, current);
        if (!widget) return fail(CustomErrorCode.widgetNotFound, ["id"]);
        const model = await this.records.getModel();
        if (
          !model.types.some((type) => type.id === widget.calendarQuery.source.typeId && !type.archived) ||
          !policy.canReadType(widget.calendarQuery.source.typeId)
        )
          return failNotFound(CustomErrorCode.recordTypeNotFound, ["calendarQuery", "source", "typeId"]);
        const issue = calendarWidgetQueryIssue(widget.calendarQuery, model);
        if (issue) return fail(issue.code, issue.path);
        const preview = await this.reader.preview(widget.calendarQuery);
        if (!preview.ok) return preview;
        const id = input.id ?? randomUUID();
        const view = await resolveDashboardView(this.views, input.viewId, current ? current.viewId : undefined);
        if (!view.ok) return failNotFound(CustomErrorCode.dataViewNotFound, ["viewId"]);
        const placement = resolveWidgetLayout({
          id,
          kind: "calendar",
          requested: input.layout,
          needsPlacement: !current || current.viewId !== view.viewId,
          widgets: await this.widgets.listLayoutPlacements(view.viewId),
        });
        if (!placement.ok) return fail(placement.code, ["layout"]);
        const row = await this.widgets.saveRecordWidget("calendar", widget, id, view.viewId, placement.layout);
        await this.records.saveReceipt(input.idempotencyKey, this.userId, hash, { widgetId: row.id });
        return {
          ok: true as const,
          data: { ...row, status: "ready" as const, data: preview.data.data, fields: preview.data.fields },
        };
      },
      { timeout: 30000 },
    );
  }
}
