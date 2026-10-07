import type { RecordWidgetReader } from "./record-widget-reader";
import { randomUUID } from "node:crypto";

import type { RecordRepo } from "@/features/records/record.repo";
import type { RecordAccessPolicy } from "@/features/records/record-access";
import type { QueryRecordMeasureInteractor } from "@/features/records/query-record-measure.interactor";
import type { RecordWidgetInput, RecordWidgetDto, RecordWidgetRepo } from "./record-widget.schema";
import type { Validated } from "@/core/validation/validation.utils";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { fail, failAuthorization, failConflict, failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { recordRequestHash } from "@/features/records/mutate-record.interactor";
import { RecordWidgetInputSchema } from "./record-widget.schema";
import { widgetDisplayTypeIssue } from "./widget-display-rules";
import { resolveWidgetLayout } from "./widget-placement";

@TenantInteractor()
export class UpsertRecordWidgetInteractor extends AuthenticatedInteractor<RecordWidgetInput, RecordWidgetDto> {
  constructor(
    private widgets: RecordWidgetRepo,
    private records: RecordRepo,
    private policy: RecordAccessPolicy,
    private measures: QueryRecordMeasureInteractor,
    private reader: RecordWidgetReader,
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
          const row = saved.widgetId ? await this.widgets.findOwned(saved.widgetId) : null;
          if (!row) return failNotFound(CustomErrorCode.widgetNotFound);
          return { ok: true as const, data: await this.reader.read(row) };
        }
        const state = await this.records.getState();
        if (state?.activeOperationId) return failConflict(CustomErrorCode.recordWritePaused);
        if (state?.revision !== input.expectedRevision) return failConflict(CustomErrorCode.recordSchemaChanged);
        if (input.id) {
          const current = await this.widgets.findOwned(input.id);
          if (!current) return failNotFound(CustomErrorCode.widgetNotFound);
          if (current.version !== input.expectedVersion) return failConflict(CustomErrorCode.recordVersionChanged);
        }
        const data = await this.measures.invoke(input.measure);
        if (!data.ok) return data;
        if (widgetDisplayTypeIssue(input.displayOptions.displayType, input.measure, await this.records.getModel()))
          return fail(CustomErrorCode.widgetDisplayTypeUnsupported, ["displayOptions", "displayType"]);
        const id = input.id ?? randomUUID();
        const placement = resolveWidgetLayout({
          id,
          kind: "chart",
          displayType: input.displayOptions.displayType,
          requested: input.layout,
          isCreate: !input.id,
          widgets: await this.widgets.listPlacements(),
        });
        if (!placement.ok) return fail(placement.code, ["layout"]);
        const row = await this.widgets.save(input, id, placement.layout);
        await this.records.saveReceipt(input.idempotencyKey, this.userId, hash, { widgetId: row.id });
        return { ok: true as const, data: await this.reader.read(row) };
      },
      { timeout: 30000 },
    );
  }
}
