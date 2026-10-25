import type { Validated } from "@/core/validation/validation.utils";
import type { RecordRepo } from "@/features/records/record.repo";
import type { RecordAccessPolicy } from "@/features/records/record-access";
import type { RecordFileUploadRepo } from "@/features/records/record-file-upload.repo";
import type { RecordWriteService } from "@/features/records/record-write.service";
import type { RecordFileDto, RenameRecordFile } from "./record-file.schema";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { INTERACTIVE_COMPANY_LOCK_WAIT_MS, runInTransaction } from "@/core/decorators/transaction-runner";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import {
  fail,
  failAuthorization,
  failConflict,
  failNotFound,
  unwoundFailure,
} from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { currentRoutineContext } from "@/core/decorators/routine-context";
import { RecordJournal } from "@/features/records/record-journal";
import { RenameRecordFileSchema } from "./record-file.schema";
import { recordFileDto } from "./record-file-dto";
import { renamedRecordFileName } from "./record-file-name";

@TenantInteractor()
export class RenameRecordFileInteractor extends AuthenticatedInteractor<RenameRecordFile, RecordFileDto> {
  constructor(
    private records: RecordRepo,
    private policy: RecordAccessPolicy,
    private writer: Pick<RecordWriteService, "validateAccess">,
    private files: Pick<RecordFileUploadRepo, "getFileCompanyWide" | "renameFileCompanyWide">,
  ) {
    super();
  }

  @Validate(RenameRecordFileSchema)
  invoke({ fileId, name }: RenameRecordFile): Validated<RecordFileDto> {
    return runInTransaction(
      async (): Validated<RecordFileDto> => {
        const policy = await this.policy.load();
        if (!policy.actor) return failAuthorization(CustomErrorCode.permissionDenied);
        const file = await this.files.getFileCompanyWide(fileId);
        if (!file || file.status === "detached" || (file.status === "pending" && file.uploadedById !== this.userId))
          return failNotFound(CustomErrorCode.recordFileNotFound, ["fileId"]);
        const renamed = renamedRecordFileName(file.name, name);
        if (!renamed) return fail(CustomErrorCode.recordFileNameInvalid, ["name"]);
        if (renamed === file.name) return { ok: true, data: recordFileDto(file) };
        if (file.status === "pending") {
          await this.files.renameFileCompanyWide(file.id, renamed);
          return { ok: true, data: recordFileDto({ ...file, name: renamed }) };
        }
        if (!file.typeId || !file.recordId || !file.fieldId)
          return failNotFound(CustomErrorCode.recordFileNotFound, ["fileId"]);
        const ref = { typeId: file.typeId, recordId: file.recordId };
        const [state, model, record] = await Promise.all([
          this.records.getState(),
          this.records.getModel(),
          this.records.getRecordCompanyWide(ref),
        ]);
        if (state?.activeOperationId) return failConflict(CustomErrorCode.recordWritePaused);
        const stored = record?.values.find((value) => value.fieldId === file.fieldId);
        if (!record || stored?.state !== "value" || !stored.textListValue.includes(file.id))
          return failNotFound(CustomErrorCode.recordFileNotFound, ["fileId"]);
        await this.writer.validateAccess(
          {
            action: "update",
            ref,
            expectedVersion: record.version,
            fields: [{ fieldId: file.fieldId, value: { kind: "file", value: stored.textListValue } }],
          },
          policy,
        );
        const journal = new RecordJournal(this.records, model);
        await journal.repository.setValue(
          ref,
          file.fieldId,
          { state: "value", value: { kind: "file", value: stored.textListValue } },
          model.revision,
        );
        await this.files.renameFileCompanyWide(file.id, renamed);
        await journal.flush(model, this.userId, `record-file-rename:${file.id}:${record.version}`, {
          kind: "mutation",
          routineDepth: currentRoutineContext()?.causationDepth,
        });
        return { ok: true, data: recordFileDto({ ...file, name: renamed }) };
      },
      { timeout: 20000, companyLockWait: INTERACTIVE_COMPANY_LOCK_WAIT_MS },
    ).catch(unwoundFailure);
  }
}
