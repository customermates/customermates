import type { RecordRepo } from "./record.repo";

import { z } from "zod";

import { Enforce } from "@/core/decorators/enforce.decorator";
import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";

const FailRecordOperationSchema = z.object({ companyId: z.uuid(), userId: z.uuid(), operationId: z.uuid() }).strict();
export type FailRecordOperationData = z.infer<typeof FailRecordOperationSchema>;

@SystemInteractor
export class FailRecordOperationInteractor {
  constructor(private records: Pick<RecordRepo, "failOperationUnscoped">) {}

  @Enforce(FailRecordOperationSchema)
  async invoke(input: FailRecordOperationData): Promise<void> {
    await this.records.failOperationUnscoped(input);
  }
}
