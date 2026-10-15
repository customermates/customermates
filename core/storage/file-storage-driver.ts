import type { FileStorageDriverName } from "@/core/config/environment";

export const FILE_STORAGE_PART_BYTES = 1024 * 1024;

export type FileUploadTarget = {
  url: string;
  method: "PUT";
  headers: Record<string, string>;
  expiresAt: string;
};

export type FileUploadRequest = {
  fileId: string;
  key: string;
  size: number;
  mimeType: string;
  expiresInSeconds: number;
};

export type StoredFileHead = { size: number; contentType: string | null };

export type StoredFileRange = { start: number; end?: number };

export type StoredFileRead = {
  stream: ReadableStream<Uint8Array>;
  size: number;
  contentType: string | null;
};

export type StoredFileWrite = { ok: true; size: number; sha256: string } | { ok: false; reason: "tooLarge" };

export interface FileStorageDriver {
  readonly name: FileStorageDriverName;
  createUpload(request: FileUploadRequest): Promise<FileUploadTarget>;
  head(key: string): Promise<StoredFileHead | null>;
  read(key: string, range?: StoredFileRange): Promise<StoredFileRead | null>;
  writeStream(key: string, stream: ReadableStream<Uint8Array>, maxBytes: number): Promise<StoredFileWrite>;
  delete(keys: string[]): Promise<void>;
}
