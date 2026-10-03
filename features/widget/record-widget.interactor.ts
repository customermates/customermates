import { randomUUID } from "node:crypto";

import type { RecordRepo } from "@/features/records/record.repo";
import type { RecordAccessPolicy } from "@/features/records/record-access";
import type { QueryRecordMeasureInteractor } from "@/features/records/query-record-measure.interactor";
import type { RecordWidgetInput, RecordWidgetDto, RecordWidgetRepo, StoredRecordWidget } from "./record-widget.schema";
import type { Validated } from "@/core/validation/validation.utils";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { failAuthorization, failConflict, failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { recordRequestHash } from "@/features/records/mutate-record.interactor";
import { RecordWidgetInputSchema } from "./record-widget.schema";

export class RecordWidgetReader {
  constructor(
    private records: RecordRepo,
    private measures: QueryRecordMeasureInteractor,
  ) {}

  read(row: StoredRecordWidget): Promise<RecordWidgetDto> {
    return runInTransaction(
      async () => {
        const result = await this.measures.invoke(row.measure);
        if (!result.ok) return { ...row, status: "unavailable" as const, data: null, groupOptions: [] };
        const model = await this.records.getModel();
        const fieldId = result.data.groups.find((group) => group.fieldId)?.fieldId;
        const field = model.fields.find((candidate) => candidate.id === fieldId && !candidate.archived);
        return {
          ...row,
          status: "ready" as const,
          data: result.data,
          groupOptions: field?.options.map(({ id, label, color }) => ({ id, label, color })) ?? [],
        };
      },
      { readOnly: true, timeout: 30000 },
    );
  }
}

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
        const row = await this.widgets.save(input, input.id ?? randomUUID());
        await this.records.saveReceipt(input.idempotencyKey, this.userId, hash, { widgetId: row.id });
        return { ok: true as const, data: await this.reader.read(row) };
      },
      { timeout: 30000 },
    );
  }
}
