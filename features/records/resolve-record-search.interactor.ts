import type { RecordRepo } from "./record.repo";
import type { RecordAccessPolicy } from "./record-access";
import type { RecordSearchHit } from "./record-search.schema";
import type { Validated } from "@/core/validation/validation.utils";
import { presetId } from "./crm-preset";
import { recordSearchHit } from "./search-records.interactor";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { failAuthorization } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { recordWriteFailure } from "./mutate-record.interactor";

import { ResolveRecordSearchSchema, type ResolveRecordSearchInput } from "./record-search.schema";

@AllowInDemoMode
@TenantInteractor()
export class ResolveRecordSearchInteractor extends AuthenticatedInteractor<
  ResolveRecordSearchInput,
  { results: RecordSearchHit[] }
> {
  constructor(
    private records: RecordRepo,
    private policy: RecordAccessPolicy,
  ) {
    super();
  }

  @Validate(ResolveRecordSearchSchema)
  async invoke(input: ResolveRecordSearchInput): Validated<{ results: RecordSearchHit[] }> {
    return runInTransaction(
      async () => {
        const [model, policy] = await Promise.all([this.records.getModel(), this.policy.load()]);
        if (!policy.actor) return failAuthorization(CustomErrorCode.permissionDenied);
        const refs = input.refs.map((ref) =>
          "typeId" in ref ? ref : { typeId: presetId(this.companyId, ref.type), recordId: ref.id },
        );
        try {
          const rows = await this.records.searchRecords(
            { refs },
            model,
            policy.access(model.types.filter((type) => !type.archived).map((type) => type.id)),
          );
          const positions = new Map(refs.map((ref, index) => [`${ref.typeId}:${ref.recordId}`, index]));
          rows.sort(
            (a, b) =>
              (positions.get(`${a.typeId}:${a.recordId}`) ?? 0) - (positions.get(`${b.typeId}:${b.recordId}`) ?? 0),
          );
          return { ok: true, data: { results: rows.map((row) => recordSearchHit(row, model)) } };
        } catch (error) {
          return recordWriteFailure(error);
        }
      },
      { readOnly: true },
    );
  }
}
