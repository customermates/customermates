import type { Validated } from "@/core/validation/validation.utils";
import type { UploadRecordFileContent, UploadRecordFileContentResult } from "./record-file.schema";
import type { RecordFileGrantTenant } from "./record-file-grant-tenant";

import { z } from "zod";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { UploadRecordFileContentSchema } from "./record-file.schema";

const UploadRecordFileContentByGrantSchema = UploadRecordFileContentSchema.extend({
  token: z.string().min(1).max(512),
}).strict();
type UploadRecordFileContentByGrant = z.infer<typeof UploadRecordFileContentByGrantSchema>;

@SystemInteractor
export class UploadRecordFileContentByGrantInteractor {
  constructor(
    private grants: RecordFileGrantTenant,
    private content: { invoke(input: UploadRecordFileContent): Validated<UploadRecordFileContentResult> },
  ) {}

  @Validate(UploadRecordFileContentByGrantSchema)
  async invoke({ token, ...input }: UploadRecordFileContentByGrant): Validated<UploadRecordFileContentResult> {
    const outcome = await this.grants.run("upload", input.fileId, token, () => this.content.invoke(input));
    if (!outcome.ok) await input.body?.cancel().catch(() => undefined);
    return outcome;
  }
}
