import type { StoredRecordFile } from "./record-file.repo";

export type PendingRecordFile = {
  id: string;
  typeId: string | null;
  fieldId: string | null;
  storageDriver: string;
  storageKey: string;
  name: string;
  mimeType: string;
  size: number;
};

export type RecordFileExtractionStatus = "pending" | "done" | "noText" | "unsupported" | "failed" | "skipped";

export type RecordFileDetails = StoredRecordFile & {
  extractionStatus: RecordFileExtractionStatus;
  pageCount: number | null;
};

export interface RecordFileUploadRepo {
  createPendingFile(file: PendingRecordFile): Promise<void>;
  getFileCompanyWide(fileId: string): Promise<RecordFileDetails | null>;
  markFileUploaded(fileId: string, upload: { size: number; sha256: string }): Promise<boolean>;
  storageUsageCompanyWide(): Promise<number>;
}
