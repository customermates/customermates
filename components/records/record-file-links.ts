import type { RecordFileSummary } from "@/features/records/record-model.schema";

import { INLINE_RECORD_FILE_TYPES } from "@/features/record-files/record-file-response";

export function recordFileContentUrl(fileId: string): string {
  return `/api/v1/files/${encodeURIComponent(fileId)}/content`;
}

export function downloadRecordFile(file: Pick<RecordFileSummary, "id" | "name">): void {
  const link = document.createElement("a");
  link.href = `${recordFileContentUrl(file.id)}?download=1`;
  link.download = file.name;
  link.click();
}

export function openRecordFile(file: Pick<RecordFileSummary, "id" | "name" | "mimeType">): void {
  const link = document.createElement("a");
  link.href = recordFileContentUrl(file.id);
  if (INLINE_RECORD_FILE_TYPES.has(file.mimeType)) {
    link.target = "_blank";
    link.rel = "noopener noreferrer";
  } else link.download = file.name;
  link.click();
}
