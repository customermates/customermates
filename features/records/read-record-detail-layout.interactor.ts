import type { z } from "zod";
import type { RecordRepo } from "./record.repo";
import type { RecordAccessPolicy } from "./record-access";
import type { Validated } from "@/core/validation/validation.utils";
import type { RecordDetailLayoutResult } from "./record-detail-layout.schema";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { ReadRecordDetailLayoutSchema } from "./record-detail-layout.schema";
import type { RecordDetailLayoutReader } from "./record-detail-layout-reader";

@AllowInDemoMode
@TenantInteractor()
export class ReadRecordDetailLayoutInteractor extends AuthenticatedInteractor<
  z.infer<typeof ReadRecordDetailLayoutSchema>,
  RecordDetailLayoutResult
> {
  constructor(
    private records: RecordRepo,
    private policy: RecordAccessPolicy,
    private reader: RecordDetailLayoutReader,
  ) {
    super();
  }

  @Validate(ReadRecordDetailLayoutSchema)
  async invoke(input: z.infer<typeof ReadRecordDetailLayoutSchema>): Validated<RecordDetailLayoutResult> {
    return runInTransaction(
      async () => {
        const [model, policy] = await Promise.all([this.records.getModel(), this.policy.load()]);
        return this.reader.read(input.typeId, model, policy);
      },
      { readOnly: true },
    );
  }
}
