import type { RecordFileIndexOutcome, RecordFileIndexService } from "./record-file-index.service";

import { z } from "zod";

import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";
import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";

const IndexRecordFilesSchema = z.object({ companyId: z.string().min(1) }).strict();
type IndexRecordFilesData = z.infer<typeof IndexRecordFilesSchema>;

@AllowInDemoMode
@SystemInteractor
export class IndexRecordFilesInteractor {
  constructor(private services: (companyId: string) => RecordFileIndexService) {}

  @Enforce(IndexRecordFilesSchema)
  invoke(input: IndexRecordFilesData): Promise<RecordFileIndexOutcome> {
    return this.services(input.companyId).indexPending();
  }
}
