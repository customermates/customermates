import { recordChannelsEnabled } from "./record-channels";
import type { RecordRepo } from "./record.repo";
import type { RecordAccessPolicy } from "./record-access";
import type { RecordDto } from "./record-model.schema";
import type { RecordRead } from "./record-query.schema";
import type { Validated } from "@/core/validation/validation.utils";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { fail, failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { RecordQuerySchema, RecordReadSchema } from "./record-query.schema";
import { invalidRecordQueryPart } from "./record-query-validation";
import { recordWriteFailure } from "./mutate-record.interactor";
import { recordDto, withMemberUsers } from "./query-records.interactor";

@AllowInDemoMode
@TenantInteractor()
export class GetRecordInteractor extends AuthenticatedInteractor<RecordRead, RecordDto> {
  constructor(
    private records: RecordRepo,
    private policy: RecordAccessPolicy,
  ) {
    super();
  }

  @Validate(RecordReadSchema)
  async invoke(input: RecordRead): Validated<RecordDto> {
    const ref = { typeId: input.typeId, recordId: input.recordId };
    return runInTransaction(
      async () => {
        const [model, policy, record] = await Promise.all([
          this.records.getModel(),
          this.policy.load(),
          this.records.getRecordCompanyWide(ref),
        ]);
        if (
          !record ||
          !(await policy.canRead(record)) ||
          !model.types.some((type) => type.id === ref.typeId && !type.archived)
        )
          return failNotFound(CustomErrorCode.recordNotFound);
        const selection = RecordQuerySchema.parse({
          typeId: ref.typeId,
          includeRelationships: input.includeRelationships,
          includePaths: input.includePaths,
        });
        const invalid = invalidRecordQueryPart(selection, model);
        if (invalid) return fail(CustomErrorCode.recordValueInvalid, [invalid]);
        try {
          const access = policy.access(model.types.filter((type) => !type.archived).map((type) => type.id));
          const visible = await this.records.getVisibleFields(ref, model, access);
          const [data] = await withMemberUsers(
            [recordDto(record, model, visible, policy.memberScope)],
            this.records,
            policy.memberScope,
          );
          if (recordChannelsEnabled(model, ref.typeId))
            data.identities = await this.records.getIdentitiesCompanyWide(ref);
          if (input.includeRelationships?.length) {
            const summaries = await this.records.relationshipSummaries(
              ref.typeId,
              [ref.recordId],
              input.includeRelationships,
              model,
              access,
            );
            data.relationships = summaries.get(ref.recordId) ?? [];
          }
          if (input.includePaths?.length) {
            const paths = await this.records.pathSummaries(
              ref.typeId,
              [ref.recordId],
              input.includePaths,
              model,
              access,
            );
            data.relationshipPaths = paths.get(ref.recordId) ?? [];
          }
          return { ok: true as const, data };
        } catch (error) {
          return recordWriteFailure(error);
        }
      },
      { readOnly: true },
    );
  }
}
