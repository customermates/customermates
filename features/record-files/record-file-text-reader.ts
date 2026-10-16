import type { RecordFileTextChunk } from "@/features/record-file-index/record-file-text-chunk";

export interface RecordFileTextReader {
  read(fileId: string, offset: number): Promise<RecordFileTextChunk | null>;
}
