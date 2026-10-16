import type { RecordFileSummary } from "@/features/records/record-model.schema";

import {
  File,
  FileArchive,
  FileAudio,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Presentation,
} from "lucide-react";

import { INLINE_RECORD_FILE_TYPES } from "@/features/record-files/record-file-response";

export function recordFileContentUrl(fileId: string): string {
  return `/api/v1/files/${encodeURIComponent(fileId)}/content`;
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

export function recordFileIcon(mimeType: string | undefined) {
  const type = mimeType ?? "";
  if (type.startsWith("image/")) return FileImage;
  if (type.startsWith("audio/")) return FileAudio;
  if (type.startsWith("video/")) return FileVideo;
  if (
    type === "application/pdf" ||
    type.startsWith("text/") ||
    type.includes("wordprocessingml") ||
    type === "application/msword"
  )
    return FileText;
  if (type.includes("spreadsheetml") || type === "application/vnd.ms-excel" || type === "text/csv")
    return FileSpreadsheet;
  if (type.includes("presentationml") || type === "application/vnd.ms-powerpoint") return Presentation;
  if (type === "application/zip" || type.includes("compressed") || type.includes("x-tar")) return FileArchive;
  return File;
}
