import type { RecordOperationService } from "./record-operation.service";

import { z } from "zod";

import { Enforce } from "@/core/decorators/enforce.decorator";
import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";

const AdvanceSystemRecordOperationSchema = z.object({ companyId: z.uuid(), operationId: z.uuid() }).strict();
export type AdvanceSystemRecordOperationData = z.infer<typeof AdvanceSystemRecordOperationSchema>;

@SystemInteractor
export class AdvanceSystemRecordOperationInteractor {
  constructor(private operations: (companyId: string) => RecordOperationService) {}

  @Enforce(AdvanceSystemRecordOperationSchema)
  invoke(input: AdvanceSystemRecordOperationData): Promise<{ done: boolean }> {
    return this.operations(input.companyId).advance(input.operationId);
  }
}
