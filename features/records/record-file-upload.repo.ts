import type { RecordFileExtractionStatus } from "@/generated/prisma";
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

export type RecordFileDetails = StoredRecordFile & {
  extractionStatus: RecordFileExtractionStatus;
  pageCount: number | null;
};

export abstract class RecordFileUploadRepo {
  abstract createPendingFile(file: PendingRecordFile): Promise<void>;
  abstract getFileCompanyWide(fileId: string): Promise<RecordFileDetails | null>;
  abstract renameFileCompanyWide(fileId: string, name: string): Promise<boolean>;
  abstract markFileUploaded(fileId: string, upload: { size: number; sha256: string }): Promise<boolean>;
  abstract storageUsageCompanyWide(): Promise<number>;
}
