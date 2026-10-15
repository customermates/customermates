import type { StoredRecordFile } from "./record-file.repo";

export type PendingRecordFile = {
  id: string;
  typeId: string;
  fieldId: string;
  storageDriver: string;
  storageKey: string;
  name: string;
  mimeType: string;
  size: number;
};

export type RecordFileExtractionStatus = "pending" | "done" | "noText" | "unsupported" | "failed" | "skipped";

export type RecordFileDetails = StoredRecordFile & { extractionStatus: RecordFileExtractionStatus };

export interface RecordFileUploadRepo {
  createPendingFile(file: PendingRecordFile): Promise<void>;
  getFileCompanyWide(fileId: string): Promise<RecordFileDetails | null>;
  markFileUploaded(fileId: string, upload: { size: number; sha256: string }): Promise<boolean>;
  storageUsageCompanyWide(): Promise<number>;
}
