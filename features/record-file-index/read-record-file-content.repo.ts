import type { RecordFileExtractionStatus, RecordFileStatus } from "@/generated/prisma";

export type StoredRecordFileContent = {
  id: string;
  typeId: string;
  fieldId: string;
  recordId: string | null;
  status: RecordFileStatus;
  name: string;
  mimeType: string;
  size: number;
  extractionStatus: RecordFileExtractionStatus;
  extractedText: string | null;
  textTruncated: boolean;
  indexedAt: Date | null;
};

export abstract class ReadRecordFileContentRepo {
  abstract getFileContent(fileId: string): Promise<StoredRecordFileContent | null>;
}
