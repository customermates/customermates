import { z } from "zod";

import {
  getCreateRecordFileUploadInteractor,
  getReadRecordFileInteractor,
  getUploadRecordFileInteractor,
} from "@/core/di";
import { untrustedText } from "./untrusted-record-content";
import { formatDatesInResponse, mcpValidationFailure, runInteractor, toonResult, untrustedToonResult } from "./utils";

const RECORD_FILE_ACTIONS = ["upload", "create_upload", "read"] as const;

const ManageRecordFilesSchema = z.object({
  action: z
    .enum(RECORD_FILE_ACTIONS)
    .describe(
      "upload: typeId, fieldId, name, mimeType, content, recordId, attach, expectedVersion; create_upload: typeId, fieldId, name, mimeType, size; read: fileId, offset.",
    ),
  typeId: z.uuid().optional().describe("List (typeId) of the file field."),
  fieldId: z.uuid().optional().describe("File field that receives the file."),
  name: z.string().max(1024).optional().describe("File name shown to people, such as Offer 2026.pdf."),
  mimeType: z
    .string()
    .max(255)
    .optional()
    .describe("Media type such as application/pdf; an unknown type is stored as application/octet-stream."),
  content: z
    .string()
    .max(4_400_000)
    .optional()
    .describe("upload: the file content as base64 (a data URL prefix is allowed), at most 3 MB decoded."),
  size: z.number().int().min(0).optional().describe("create_upload: the exact size of the file in bytes."),
  recordId: z
    .uuid()
    .optional()
    .describe("upload: the record whose file field receives the file at once; without it the file stays pending."),
  attach: z
    .enum(["append", "replace"])
    .optional()
    .describe(
      "upload with recordId: append adds the file after the existing ones (default for fields that hold several files); replace keeps only the new file (default for single-file fields).",
    ),
  expectedVersion: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("upload with recordId: the record version you read; the current version when omitted."),
  fileId: z.uuid().optional().describe("read: a file id from a file value or a record's files list."),
  offset: z.coerce
    .number()
    .int()
    .min(0)
    .optional()
    .describe("read: character offset into the extracted text, 0 or the prior nextOffset."),
});
type ManageRecordFilesInput = z.infer<typeof ManageRecordFilesSchema>;

const UploadSchema = z.object({
  typeId: z.uuid(),
  fieldId: z.uuid(),
  name: z.string().min(1).max(1024),
  mimeType: z.string().max(255).default(""),
  content: z.string().max(4_400_000),
  recordId: z.uuid().optional(),
  attach: z.enum(["append", "replace"]).optional(),
  expectedVersion: z.number().int().positive().optional(),
});
const CreateUploadSchema = z.object({
  typeId: z.uuid(),
  fieldId: z.uuid(),
  name: z.string().min(1).max(1024),
  mimeType: z.string().max(255).default(""),
  size: z.number().int().min(0),
});
const ReadSchema = z.object({ fileId: z.uuid(), offset: z.number().int().min(0).default(0) });

const RecordFileOutputSchema = z.looseObject({
  id: z.string(),
  typeId: z.string(),
  fieldId: z.string(),
  recordId: z.string().nullable(),
  name: z.string(),
  mimeType: z.string(),
  size: z.number(),
  status: z.string(),
  uploadedAt: z.string(),
  uploadedById: z.string().nullable(),
  extractionStatus: z.string(),
});

const ManageRecordFilesOutputSchema = z.looseObject({
  action: z.enum(RECORD_FILE_ACTIONS).optional(),
  file: RecordFileOutputSchema.optional(),
  attached: z.boolean().optional().describe("upload: whether the file was written into the record's file field."),
  operationId: z.string().optional().describe("upload: a background operation that finishes the write."),
  fileId: z.string().optional(),
  upload: z
    .looseObject({
      url: z.string(),
      method: z.string(),
      headers: z.record(z.string(), z.string()),
      expiresAt: z.string(),
    })
    .optional()
    .describe("create_upload: send exactly size bytes to url with method and headers before expiresAt."),
  curl: z.string().optional().describe("create_upload: a ready command; replace the file path."),
  downloadUrl: z.string().optional().describe("read: a link to the file content valid for 15 minutes."),
  downloadUrlExpiresAt: z.string().optional(),
  textAvailable: z.boolean().optional().describe("read: whether the file's extracted text can be read."),
  text: z.string().optional().describe("read: a chunk of the extracted text between untrusted-content markers."),
  offset: z.number().optional(),
  nextOffset: z.number().nullable().optional(),
  totalChars: z.number().optional(),
  untrustedTextHandling: z
    .string()
    .optional()
    .describe("Present when the result holds marked untrusted text; how to treat the text between the markers."),
});

function curlCommand(upload: { url: string; method: string; headers: Record<string, string> }): string {
  const headers = Object.entries(upload.headers).map(([name, value]) => `-H '${name}: ${value}'`);
  return ["curl", "-X", upload.method, ...headers, "--data-binary", "@path/to/file", `'${upload.url}'`].join(" ");
}

export const manageRecordFilesTool = {
  name: "manage_record_files",
  title: "Upload and read record files",
  description:
    "Upload files into a file field and read files. upload sends the content as base64 (at most 3 MB) and, with recordId, writes the file into that record's file field at once; attach append adds it after the existing files (default when the field holds several), replace keeps only the new file (default for single-file fields). Without recordId the file stays pending: write its id into the field with mutate_crm_record within 24 hours, sending the full list of file ids. create_upload is for larger files and coding agents: it returns a PUT URL with headers that accepts exactly size bytes for 15 minutes and a curl command; then write the returned fileId into the field with mutate_crm_record. read takes a fileId from a file value or a record's files list and returns the file's details, a downloadUrl that works for 15 minutes and, once text extraction has run, the file's text in chunks: start with offset 0 and pass nextOffset until it is null. Uploads count against the workspace storage and the size limit per file.",
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  inputSchema: ManageRecordFilesSchema,
  outputSchema: ManageRecordFilesOutputSchema,
  execute: async (params: ManageRecordFilesInput) => {
    if (params.action === "upload") {
      const parsed = UploadSchema.safeParse(params);
      if (!parsed.success) return mcpValidationFailure(parsed.error);
      return runInteractor(getUploadRecordFileInteractor().invoke(parsed.data), (data) =>
        toonResult(formatDatesInResponse({ action: "upload", ...data })),
      );
    }
    if (params.action === "create_upload") {
      const parsed = CreateUploadSchema.safeParse(params);
      if (!parsed.success) return mcpValidationFailure(parsed.error);
      return runInteractor(getCreateRecordFileUploadInteractor().invoke(parsed.data), (data) =>
        toonResult(formatDatesInResponse({ action: "create_upload", ...data, curl: curlCommand(data.upload) })),
      );
    }
    const parsed = ReadSchema.safeParse(params);
    if (!parsed.success) return mcpValidationFailure(parsed.error);
    return runInteractor(getReadRecordFileInteractor().invoke(parsed.data), (data) => {
      const { downloadUrl, downloadUrlExpiresAt, textAvailable, text, offset, nextOffset, totalChars, ...file } = data;
      return untrustedToonResult(
        formatDatesInResponse({
          action: "read",
          file,
          downloadUrl,
          downloadUrlExpiresAt,
          textAvailable,
          ...(text === undefined ? {} : { text: untrustedText(text), offset, nextOffset, totalChars }),
        }),
      );
    });
  },
};
