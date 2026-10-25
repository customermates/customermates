import type { RecordFileSummary } from "@/features/records/record-model.schema";
import { workspaceApiUrl } from "@/core/navigation/workspace-api-url";

export function recordFileContentUrl(fileId: string): string {
  return workspaceApiUrl(`/api/v1/files/${encodeURIComponent(fileId)}/content`);
}

export function downloadRecordFile(file: Pick<RecordFileSummary, "id" | "name">): void {
  const link = document.createElement("a");
  link.href = `${recordFileContentUrl(file.id)}?download=1`;
  link.download = file.name;
  link.click();
}
