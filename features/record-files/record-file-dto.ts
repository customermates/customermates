import type { RecordFileDetails } from "@/features/records/record-file-upload.repo";
import type { RecordFileDto } from "./record-file.schema";

export function recordFileDto(file: RecordFileDetails): RecordFileDto {
  return {
    id: file.id,
    typeId: file.typeId,
    fieldId: file.fieldId,
    recordId: file.status === "pending" ? null : file.recordId,
    name: file.name,
    mimeType: file.mimeType,
    size: file.size,
    status: file.status === "pending" ? "pending" : "ready",
    uploadedAt: file.createdAt.toISOString(),
    uploadedById: file.uploadedById,
    extractionStatus: file.extractionStatus,
  };
}
