import type { ReadRecordFileContentRepo } from "./read-record-file-content.repo";
import type { RecordFileTextChunk } from "./record-file-text-chunk";

import { untrustedText } from "@/features/mcp-tools/untrusted-record-content";

import { boundedRecordFileText } from "./record-file-text-chunk";

export const RECORD_FILE_READ_MAX_LENGTH = 5_000;

export class ExtractedRecordFileTextReader {
  constructor(private files: ReadRecordFileContentRepo) {}

  async read(fileId: string, offset: number): Promise<RecordFileTextChunk | null> {
    const file = await this.files.getFileContent(fileId);
    const text = file?.status === "ready" && file.extractionStatus === "done" ? file.extractedText : null;
    if (!text) return null;
    return boundedRecordFileText({
      text,
      offset,
      maxLength: RECORD_FILE_READ_MAX_LENGTH,
      outline: false,
      render: (chunk) => chunk,
      measure: (chunk) => JSON.stringify({ ...chunk, text: untrustedText(chunk.text) }).length,
    });
  }
}
