import type { FileStorageDriverName } from "@/core/config/environment";
import type { RecordRepo } from "@/features/records/record.repo";
import type { RecordAccessPolicy } from "@/features/records/record-access";
import type { PendingRecordFile, RecordFileUploadRepo } from "@/features/records/record-file-upload.repo";
import type { CreateRecordFileUpload } from "./record-file.schema";
import type { RecordFileQuotaService } from "./record-file-quota.service";

import { randomBytes, randomUUID } from "node:crypto";

import { UserAccessor } from "@/core/base/user-accessor";
import { unwindFailure } from "@/core/validation/failure-unwind";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { normalizeRecordFileMimeType, sanitizeRecordFileName } from "./record-file-name";
import { exceedsFileStorageQuota } from "./record-file-quota";
import { storageSizeLabel } from "./storage-size";

export type RecordFileUploadLimits = { maxBytes: number; driver: FileStorageDriverName };

export class RecordFileUploadService extends UserAccessor {
  constructor(
    private records: Pick<RecordRepo, "getModel">,
    private policy: RecordAccessPolicy,
    private files: RecordFileUploadRepo,
    private quota: RecordFileQuotaService,
    private limits: RecordFileUploadLimits,
  ) {
    super();
  }

  async reserve(input: CreateRecordFileUpload, locale: string): Promise<PendingRecordFile> {
    const [model, policy] = await Promise.all([this.records.getModel(), this.policy.load()]);
    if (!policy.actor) throw unwindFailure(CustomErrorCode.permissionDenied, "authorization");
    if (!model.types.some((type) => type.id === input.typeId && !type.archived))
      throw unwindFailure(CustomErrorCode.recordTypeNotFound, "not_found", ["typeId"]);
    const field = model.fields.find(
      (candidate) => candidate.id === input.fieldId && candidate.typeId === input.typeId && !candidate.archived,
    );
    if (!field || field.valueType !== "file")
      throw unwindFailure(CustomErrorCode.recordValueInvalid, "validation", ["fieldId"]);
    if (!policy.allowed(input.typeId, "create") && !policy.allowed(input.typeId, "update"))
      throw unwindFailure(CustomErrorCode.permissionDenied, "authorization");
    if (input.size > this.limits.maxBytes) {
      throw unwindFailure(CustomErrorCode.recordFileTooLarge, "validation", ["size"], {
        limit: storageSizeLabel(this.limits.maxBytes, locale),
      });
    }
    const name = sanitizeRecordFileName(input.name);
    if (!name) throw unwindFailure(CustomErrorCode.recordFileNameInvalid, "validation", ["name"]);
    const usage = await this.quota.usage();
    if (exceedsFileStorageQuota(usage.usedBytes, input.size, usage.limitBytes)) {
      throw unwindFailure(CustomErrorCode.storageQuotaExceeded, "conflict", ["size"], {
        used: storageSizeLabel(usage.usedBytes, locale),
        limit: storageSizeLabel(usage.limitBytes ?? 0, locale),
      });
    }
    const id = randomUUID();
    const file: PendingRecordFile = {
      id,
      typeId: input.typeId,
      fieldId: input.fieldId,
      storageDriver: this.limits.driver,
      storageKey: `${this.companyId}/${id}/${randomBytes(16).toString("hex")}`,
      name,
      mimeType: normalizeRecordFileMimeType(input.mimeType),
      size: input.size,
    };
    await this.files.createPendingFile(file);
    return file;
  }
}
