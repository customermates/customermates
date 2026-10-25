import { z } from "zod";

import {
  getAttachRecordFileInteractor,
  getCreateRecordFileUploadInteractor,
  getReadRecordFileInteractor,
  getRenameRecordFileInteractor,
  getSearchRecordFilesInteractor,
  getUploadRecordFileInteractor,
} from "@/core/di";
import { RecordFileSearchSchema } from "@/features/record-file-index/record-file-index.schema";
import {
  AttachRecordFileSchema,
  CreateRecordFileUploadSchema,
  ReadRecordFileSchema,
  RecordFileAttachModeSchema,
  RenameRecordFileSchema,
  UploadRecordFileSchema,
} from "@/features/record-files/record-file.schema";
import { untrustedText } from "./untrusted-record-content";
import { formatDatesInResponse, mcpValidationFailure, runInteractor, toonResult, untrustedToonResult } from "./utils";

const RECORD_FILE_ACTIONS = ["upload", "create_upload", "read", "attach", "rename", "search"] as const;

const ManageRecordFilesSchema = z.object({
  action: z
    .enum(RECORD_FILE_ACTIONS)
    .describe(
      "upload: typeId, fieldId, name, mimeType, content, recordId, mode, expectedVersion; create_upload: typeId, fieldId, name, mimeType, size; read: fileId, offset; attach: fileId, typeId, recordId, fieldId, mode, expectedVersion; rename: fileId, name; search: query, limit.",
    ),
  typeId: z.uuid().optional().describe("List (typeId) of the file field."),
  fieldId: z.uuid().optional().describe("File field that receives the file."),
  name: z
    .string()
    .max(1024)
    .optional()
    .describe(
      "File name shown to people, such as Offer 2026.pdf. rename: the new name; without an extension the file keeps its current one.",
    ),
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
    .describe(
      "upload: the record whose file field receives the file at once; without it the file stays pending. attach: the record whose file field receives the file.",
    ),
  mode: RecordFileAttachModeSchema.optional().describe(
    "upload with recordId and attach: append adds the file after the existing ones (default for fields that hold several files); replace keeps only the new file (default for single-file fields).",
  ),
  expectedVersion: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("upload with recordId and attach: the record version you read; the current version when omitted."),
  fileId: z
    .uuid()
    .optional()
    .describe(
      "read: a file id from a file value, a record's files list or a file the user attached in a chat. attach: a pending file you uploaded, such as a file the user attached in a chat. rename: a file in a record's file field or a pending file you uploaded.",
    ),
  offset: z.coerce
    .number()
    .int()
    .min(0)
    .optional()
    .describe("read: character offset into the extracted text, 0 or the prior nextOffset."),
  query: z.string().max(200).optional().describe("search: words to find in the text of the files you can read."),
  limit: z.coerce.number().int().min(1).optional().describe("search: how many files to return, at most 10."),
});
type ManageRecordFilesInput = z.infer<typeof ManageRecordFilesSchema>;

const UploadSchema = z.object({
  ...UploadRecordFileSchema.shape,
  mimeType: UploadRecordFileSchema.shape.mimeType.default(""),
});
const CreateUploadSchema = z.object({
  ...CreateRecordFileUploadSchema.shape,
  mimeType: CreateRecordFileUploadSchema.shape.mimeType.default(""),
});
const ReadSchema = z.object(ReadRecordFileSchema.shape);
const AttachSchema = z.object(AttachRecordFileSchema.shape);
const RenameSchema = z.object(RenameRecordFileSchema.shape);
const SearchSchema = z.object(RecordFileSearchSchema.shape);

const RecordFileOutputSchema = z.looseObject({
  id: z.string(),
  typeId: z.string().nullable(),
  fieldId: z.string().nullable(),
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
  attached: z
    .boolean()
    .optional()
    .describe("upload and attach: whether the file was written into the record's file field."),
  operationId: z
    .string()
    .optional()
    .describe("upload and attach: a background operation that finishes the write; read it with read_crm_operation."),
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
  items: z
    .array(z.looseObject({ id: z.string(), name: z.string(), snippet: z.string(), offset: z.number() }))
    .optional()
    .describe(
      "search: matching files, best first, each with its record, a snippet between untrusted-content markers and the offset to read from.",
    ),
  didYouMean: z.array(z.string()).optional(),
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
  title: "Upload, attach and read record files",
  description:
    "Upload files into a file field and read files. upload sends the content as base64 (at most 3 MB) and, with recordId, writes the file into that record's file field at once; mode append adds it after the existing files (default when the field holds several), replace keeps only the new file (default for single-file fields). Without recordId the file stays pending: write its id into the field with mutate_crm_record within 24 hours, sending the full list of file ids. create_upload is for larger files and coding agents: it returns a PUT URL with headers that accepts exactly size bytes for 15 minutes and a curl command; then write the returned fileId into the field with mutate_crm_record. attach writes a pending file you uploaded into a record's file field: a file the user attached to a chat message (its fileId is in the message) or an upload without recordId. It is a record update like upload with recordId (mode append or replace, expectedVersion); a file already in that field is returned unchanged, and once attached the record's and field's access rules apply to it. read takes a fileId from a file value, a record's files list or a chat attachment and returns the file's details, a downloadUrl that works for 15 minutes and, once text extraction has run, the file's text in chunks: start with offset 0 and pass nextOffset until it is null. rename gives a file a new name (folders are refused; a name without an extension keeps the current one); for a file in a record's file field it is a record update that needs edit access to the field and shows in the record's activity. search finds files you can read by the words in their extracted text and returns each with its record, a snippet and the offset to pass to read. To remove a file from a record, write the field's list without its id with mutate_crm_record. Uploads count against the workspace storage and the size limit per file.",
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
    if (params.action === "attach") {
      const parsed = AttachSchema.safeParse(params);
      if (!parsed.success) return mcpValidationFailure(parsed.error);
      return runInteractor(getAttachRecordFileInteractor().invoke(parsed.data), (data) =>
        toonResult(formatDatesInResponse({ action: "attach", ...data })),
      );
    }
    if (params.action === "rename") {
      const parsed = RenameSchema.safeParse(params);
      if (!parsed.success) return mcpValidationFailure(parsed.error);
      return runInteractor(getRenameRecordFileInteractor().invoke(parsed.data), (file) =>
        toonResult(formatDatesInResponse({ action: "rename", file })),
      );
    }
    if (params.action === "search") {
      const parsed = SearchSchema.safeParse(params);
      if (!parsed.success) return mcpValidationFailure(parsed.error);
      return runInteractor(getSearchRecordFilesInteractor().invoke(parsed.data), (data) =>
        untrustedToonResult({
          action: "search",
          items: data.items.map((item) => ({
            ...item,
            snippet: untrustedText(item.snippet),
            ...(item.section ? { section: untrustedText(item.section) } : {}),
          })),
          ...(data.didYouMean ? { didYouMean: data.didYouMean } : {}),
        }),
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
