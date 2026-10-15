import type { RecordRepo } from "@/features/records/record.repo";
import type { RecordAccessPolicy } from "@/features/records/record-access";
import type { RecordFileDetails, RecordFileUploadRepo } from "@/features/records/record-file-upload.repo";

import { UserAccessor } from "@/core/base/user-accessor";
import { unwindFailure } from "@/core/validation/failure-unwind";
import { CustomErrorCode } from "@/core/validation/validation.types";

function missing(): Error {
  return unwindFailure(CustomErrorCode.recordFileNotFound, "not_found", ["fileId"]);
}

export class RecordFileAccessService extends UserAccessor {
  constructor(
    private records: RecordRepo,
    private policy: RecordAccessPolicy,
    private files: Pick<RecordFileUploadRepo, "getFileCompanyWide">,
  ) {
    super();
  }

  async readable(fileId: string): Promise<RecordFileDetails> {
    const file = await this.files.getFileCompanyWide(fileId);
    if (!file || file.status === "detached") throw missing();
    if (file.status === "pending") {
      if (file.uploadedById !== this.userId) throw missing();
      return file;
    }
    if (!file.recordId) throw missing();
    const ref = { typeId: file.typeId, recordId: file.recordId };
    const [model, policy, record] = await Promise.all([
      this.records.getModel(),
      this.policy.load(),
      this.records.getRecordCompanyWide(ref),
    ]);
    const field = model.fields.find((candidate) => candidate.id === file.fieldId && !candidate.archived);
    if (!record || !field || !model.types.some((type) => type.id === ref.typeId && !type.archived)) throw missing();
    if (!(await policy.canRead(record))) throw unwindFailure(CustomErrorCode.permissionDenied, "authorization");
    const access = policy.access(model.types.filter((type) => !type.archived).map((type) => type.id));
    if (!(await this.records.getVisibleFields(ref, model, access)).has(field.id))
      throw unwindFailure(CustomErrorCode.permissionDenied, "authorization");
    const stored = record.values.find((value) => value.fieldId === field.id);
    if (stored?.state !== "value" || !stored.textListValue.includes(file.id)) throw missing();
    return file;
  }
}
