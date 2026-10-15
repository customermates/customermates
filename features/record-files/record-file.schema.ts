import { z } from "zod";

export const RECORD_FILE_UPLOAD_SECONDS = 15 * 60;
export const RECORD_FILE_CLOUD_MAX_BYTES = 25 * 1024 * 1024;

export const CreateRecordFileUploadSchema = z
  .object({
    typeId: z.uuid().describe("List (typeId) whose file field receives the file."),
    fieldId: z.uuid().describe("File field of that list."),
    name: z
      .string()
      .min(1)
      .max(1024)
      .describe(
        "File name shown to people; folders and control characters are removed and it is cut to 255 characters.",
      ),
    size: z
      .number()
      .int()
      .min(0)
      .max(Number.MAX_SAFE_INTEGER)
      .describe("Exact size in bytes. The upload must send exactly this many bytes."),
    mimeType: z
      .string()
      .max(255)
      .describe(
        "Media type such as application/pdf; an empty or malformed type is stored as application/octet-stream.",
      ),
  })
  .strict();
export type CreateRecordFileUpload = z.infer<typeof CreateRecordFileUploadSchema>;

export const RecordFileUploadTargetSchema = z
  .object({
    url: z.url().describe("Send the bytes here with the given method and headers before expiresAt."),
    method: z.literal("PUT"),
    headers: z.record(z.string(), z.string()).describe("Headers the upload request must send unchanged."),
    expiresAt: z.iso.datetime().describe("The upload URL stops working at this time (15 minutes)."),
  })
  .strict();

export const CreateRecordFileUploadResultSchema = z
  .object({
    fileId: z
      .uuid()
      .describe(
        "Id of the pending file. After the upload, write it into the file field, for example with records/mutate.",
      ),
    upload: RecordFileUploadTargetSchema,
  })
  .strict();
export type CreateRecordFileUploadResult = z.infer<typeof CreateRecordFileUploadResultSchema>;

export const RecordFileIdSchema = z.object({ fileId: z.uuid().describe("Id of the file.") }).strict();
export type RecordFileId = z.infer<typeof RecordFileIdSchema>;

export const UploadRecordFileContentSchema = z
  .object({
    fileId: z.uuid(),
    body: z.custom<ReadableStream<Uint8Array> | null>((value) => value === null || value instanceof ReadableStream),
  })
  .strict();
export type UploadRecordFileContent = z.infer<typeof UploadRecordFileContentSchema>;

export const RecordFileStatusSchema = z
  .enum(["pending", "ready"])
  .describe("pending: uploaded or awaiting its bytes but not yet in a file field; ready: in a record's file field.");

export const RecordFileExtractionStatusSchema = z
  .enum(["pending", "done", "noText", "unsupported", "failed", "skipped"])
  .describe(
    "Text extraction for search: pending, done, noText (no text layer), unsupported, failed or skipped when indexing is off.",
  );

export const RecordFileDtoSchema = z
  .object({
    id: z.uuid(),
    typeId: z.uuid(),
    fieldId: z.uuid(),
    recordId: z.uuid().nullable().describe("Record whose file field holds the file; null while pending."),
    name: z.string(),
    mimeType: z.string(),
    size: z.number().int().nonnegative().describe("Size in bytes."),
    status: RecordFileStatusSchema,
    uploadedAt: z.iso.datetime(),
    uploadedById: z.uuid().nullable(),
    extractionStatus: RecordFileExtractionStatusSchema,
  })
  .strict();
export type RecordFileDto = z.infer<typeof RecordFileDtoSchema>;

export const RecordFileReadResultSchema = RecordFileDtoSchema.extend({
  downloadUrl: z
    .url()
    .describe(
      "Signed link to the file content for the caller, valid for 15 minutes; access is checked again on download.",
    ),
  downloadUrlExpiresAt: z.iso.datetime(),
}).strict();
export type RecordFileReadResult = z.infer<typeof RecordFileReadResultSchema>;

export const UploadRecordFileContentResultSchema = z
  .object({
    fileId: z.uuid(),
    size: z.number().int().nonnegative().describe("Bytes stored."),
    sha256: z.string().describe("SHA-256 of the stored bytes in hex."),
  })
  .strict();
export type UploadRecordFileContentResult = z.infer<typeof UploadRecordFileContentResultSchema>;

export const DownloadRecordFileSchema = z
  .object({
    fileId: z.uuid(),
    range: z.string().max(200).nullish(),
    download: z.boolean().optional(),
  })
  .strict();
export type DownloadRecordFile = z.infer<typeof DownloadRecordFileSchema>;

export const DownloadRecordFileByTokenSchema = DownloadRecordFileSchema.extend({
  token: z.string().min(1).max(512),
}).strict();
export type DownloadRecordFileByToken = z.infer<typeof DownloadRecordFileByTokenSchema>;

export const RECORD_FILE_INLINE_UPLOAD_MAX_BYTES = 3 * 1024 * 1024;

export const UploadRecordFileSchema = z
  .object({
    typeId: z.uuid(),
    fieldId: z.uuid(),
    name: z.string().min(1).max(1024),
    mimeType: z.string().max(255),
    content: z.string().max(4_400_000),
    recordId: z.uuid().optional(),
    attach: z.enum(["append", "replace"]).optional(),
    expectedVersion: z.number().int().positive().optional(),
  })
  .strict();
export type UploadRecordFile = z.infer<typeof UploadRecordFileSchema>;

export const UploadRecordFileResultSchema = z
  .object({
    file: RecordFileDtoSchema,
    attached: z.boolean(),
    operationId: z.uuid().optional(),
  })
  .strict();
export type UploadRecordFileResult = z.infer<typeof UploadRecordFileResultSchema>;

export const FileStorageUsageSchema = z
  .object({
    usedBytes: z.number().int().nonnegative(),
    limitBytes: z.number().int().positive().nullable(),
  })
  .strict();
export type FileStorageUsageDto = z.infer<typeof FileStorageUsageSchema>;

export const ReadRecordFileSchema = z.object({ fileId: z.uuid(), offset: z.number().int().min(0).default(0) }).strict();
export type ReadRecordFile = z.infer<typeof ReadRecordFileSchema>;

export const ReadRecordFileResultSchema = RecordFileReadResultSchema.extend({
  textAvailable: z.boolean().describe("Whether extracted text of the file can be read in chunks."),
  text: z.string().optional(),
  offset: z.number().int().nonnegative().optional(),
  nextOffset: z.number().int().nonnegative().nullable().optional(),
  totalChars: z.number().int().nonnegative().optional(),
}).strict();
export type ReadRecordFileResult = z.infer<typeof ReadRecordFileResultSchema>;
