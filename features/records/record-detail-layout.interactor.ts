import type { RecordDetailLayoutReader } from "./record-detail-layout-reader";
import type { RecordRepo } from "./record.repo";
import type { RecordAccessPolicy } from "./record-access";
import type { UpsertP13nRepo } from "@/features/p13n/upsert-p13n.repo";
import type { Validated } from "@/core/validation/validation.utils";
import type { RecordDetailLayoutResult, SaveRecordDetailLayoutInput } from "./record-detail-layout.schema";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { fail, failNotFound, failConflict } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { recordDetailLayoutIsValid } from "./record-detail-layout";
import { SaveRecordDetailLayoutSchema, recordDetailKey } from "./record-detail-layout.schema";
import { recordRequestHash } from "./mutate-record.interactor";

export type Policy = Awaited<ReturnType<RecordAccessPolicy["load"]>>;

@TenantInteractor()
export class SaveRecordDetailLayoutInteractor extends AuthenticatedInteractor<
  SaveRecordDetailLayoutInput,
  RecordDetailLayoutResult
> {
  constructor(
    private records: RecordRepo,
    private policy: RecordAccessPolicy,
    private personalization: UpsertP13nRepo,
    private reader: RecordDetailLayoutReader,
  ) {
    super();
  }

  @Validate(SaveRecordDetailLayoutSchema)
  async invoke(input: SaveRecordDetailLayoutInput): Validated<RecordDetailLayoutResult> {
    return runInTransaction(async () => {
      const [model, policy] = await Promise.all([this.records.getModel(), this.policy.load()]);
      const type = model.types.find((type) => type.id === input.typeId && !type.archived);
      if (!type || !policy.actor || !policy.canReadType(type.id))
        return failNotFound(CustomErrorCode.recordTypeNotFound);
      const hash = recordRequestHash({ operation: "saveRecordDetailLayout", ...input });
      const receipt = await this.records.receipt(input.idempotencyKey, this.userId);
      if (receipt) {
        return receipt.requestHash === hash
          ? this.reader.read(type.id, model, policy)
          : failConflict(CustomErrorCode.recordIdempotencyConflict);
      }
      if (model.revision !== input.expectedRevision) return failConflict(CustomErrorCode.recordSchemaChanged);
      if ((await this.records.getState())?.activeOperationId) return failConflict(CustomErrorCode.recordWritePaused);
      if (input.layout && !recordDetailLayoutIsValid(type.id, input.layout, model))
        return fail(CustomErrorCode.recordValueInvalid, ["layout"]);
      const current = await this.reader.read(type.id, model, policy);
      if (!current.ok) return current;
      const available = new Set(current.data.fields.map((field) => field.id));
      if (input.layout && Object.values(input.layout).some((keys) => keys.some((key) => !available.has(key))))
        return fail(CustomErrorCode.recordValueInvalid, ["layout"]);
      await this.personalization.upsertP13n({
        p13nId: recordDetailKey(type.id),
        detailOptions: input.layout
          ? {
              starredFieldIds: input.layout.pinnedFields,
              hiddenFieldIds: input.layout.hiddenFields,
              fieldOrder: input.layout.fieldOrder,
              collapsedSectionIds: [],
            }
          : null,
        columnOrder: null,
      });
      const result = await this.reader.read(type.id, model, policy);
      if (!result.ok) return result;
      await this.records.saveReceipt(input.idempotencyKey, this.userId, hash, result.data);
      return result;
    });
  }
}
