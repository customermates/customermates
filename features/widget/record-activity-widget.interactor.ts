import type { RecordActivityWidgetReader } from "./record-activity-widget-reader";
import { randomUUID } from "node:crypto";
import type { RecordRepo } from "@/features/records/record.repo";
import type { RecordAccessPolicy } from "@/features/records/record-access";
import type { GetRecordActivitiesInteractor } from "@/ee/messaging/activities/get-record-activities.interactor";
import type {
  RecordActivityWidgetInput,
  RecordActivityWidgetDto,
  RecordActivityWidgetRepo,
} from "./record-activity-widget.schema";
import type { Validated } from "@/core/validation/validation.utils";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { failAuthorization, failConflict, failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { recordRequestHash } from "@/features/records/mutate-record.interactor";
import { RecordActivityWidgetInputSchema } from "./record-activity-widget.schema";

@TenantInteractor()
export class UpsertRecordActivityWidgetInteractor extends AuthenticatedInteractor<
  RecordActivityWidgetInput,
  RecordActivityWidgetDto
> {
  constructor(
    private widgets: RecordActivityWidgetRepo,
    private records: RecordRepo,
    private policy: RecordAccessPolicy,
    private activities: GetRecordActivitiesInteractor,
    private reader: RecordActivityWidgetReader,
  ) {
    super();
  }

  @Validate(RecordActivityWidgetInputSchema)
  async invoke(input: RecordActivityWidgetInput): Validated<RecordActivityWidgetDto> {
    return runInTransaction(
      async () => {
        if (!(await this.policy.load()).actor) return failAuthorization(CustomErrorCode.permissionDenied);
        const hash = recordRequestHash({ operation: "activity-widget", input });
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
          const row = await this.widgets.findOwned(input.id);
          if (!row) return failNotFound(CustomErrorCode.widgetNotFound);
          if (row.version !== input.expectedVersion) return failConflict(CustomErrorCode.recordVersionChanged);
        }
        const result = await this.activities.invoke({ ...input.activityQuery, cursor: null, limit: 25 });
        if (!result.ok) return result;
        const row = await this.widgets.save(input, input.id ?? randomUUID());
        await this.records.saveReceipt(input.idempotencyKey, this.userId, hash, { widgetId: row.id });
        return {
          ok: true as const,
          data: { ...row, schemaRevision: state.revision, data: result.data, status: "ready" as const },
        };
      },
      { timeout: 30000 },
    );
  }
}
