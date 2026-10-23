import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import { StructuredApiResponses } from "@/core/api/structured-interactor-handler";
import { structuredOperation } from "@/core/openapi/structured-operation";
import { RecordFilePreviewSchema } from "./record-file-preview.schema";
import {
  AttachRecordFileTargetSchema,
  CreateRecordFileUploadResultSchema,
  CreateRecordFileUploadSchema,
  RecordFileDtoSchema,
  RecordFileReadResultSchema,
  RenameRecordFileSchema,
  UploadRecordFileContentResultSchema,
  UploadRecordFileResultSchema,
} from "./record-file.schema";

const FILE_CONTRACT =
  "Files of file fields. Upload in three steps: start an upload, send the bytes to the returned URL, then write the file id into the file field with `/v1/records/mutate` or attach it with `/v1/files/{id}/attach`. Access to a file follows read access to its record and field.";

const FileIdPathSchema = z.object({ id: z.uuid().describe("Id of the file.") });
const FileTokenSchema = z
  .string()
  .max(512)
  .optional()
  .describe("Signed token from an upload URL or a downloadUrl; replaces the API key for this one file for 15 minutes.");
const BinarySchema = z.string().meta({ format: "binary" });
const FILE_SECURITY: Array<Record<string, string[]>> = [{ apiKeyAuth: [] }, { fileLinkToken: [] }];

const createUploadOperation = structuredOperation({
  operationId: "createFileUpload",
  summary: "Start a file upload",
  description: `${FILE_CONTRACT} Checks the file field, your create or update access to its list, the size limit and the workspace storage. Returns a pending fileId and where to send the bytes within 15 minutes: send exactly size bytes with the given method and headers. The URL is either this API's content route or a presigned URL of the workspace's object store. A pending file that is never written into a file field is deleted after 24 hours.`,
  requires: "create or update access to the list",
  tag: "files",
  input: CreateRecordFileUploadSchema,
  output: CreateRecordFileUploadResultSchema,
  outputDescription: "The pending file and its upload target.",
  example: {
    typeId: "0b6f3c1e-8a52-4c39-9d7e-2f4a6b8c1d01",
    fieldId: "c7e1a3b5-2d4f-4a6c-9e8b-0f1a2b3c4d31",
    name: "Offer 2026.pdf",
    size: 183204,
    mimeType: "application/pdf",
  },
});

const getFileOperation: ZodOpenApiOperationObject = {
  operationId: "getFile",
  summary: "Read file details",
  description: `${FILE_CONTRACT} Returns the file's metadata and a downloadUrl that works without other credentials for 15 minutes. A pending file is visible only to the person who uploaded it. A file of another workspace, of a record in Trash or removed from its field answers 404.\n\nRequires: read access to the record and the file field`,
  tags: ["files"],
  security: [{ apiKeyAuth: [] }],
  requestParams: { path: FileIdPathSchema },
  responses: {
    "200": {
      description: "The file details and a signed download link.",
      content: { "application/json": { schema: RecordFileReadResultSchema } },
    },
    ...StructuredApiResponses,
  },
};

const previewFileOperation: ZodOpenApiOperationObject = {
  operationId: "previewFile",
  summary: "Preview a document or spreadsheet",
  description: `${FILE_CONTRACT} Returns readable Word (.docx), TXT, Markdown or JSON content, or read-only Excel (.xlsx) and CSV sheets. Independent of background indexing and embeddings. Files up to 25 MiB are read; previews contain at most 100,000 characters, 10 sheets, 200 rows and 50 columns per sheet, and 2,000 characters per cell. truncated identifies a partial preview. Formatting, embedded images and charts are not reproduced; formulas use their stored results. Unsupported, empty, oversized or unreadable files return kind unavailable. Requires a session or API key; signed content links do not authorize this endpoint.\n\nRequires: read access to the record and file field, or ownership of a pending upload`,
  tags: ["files"],
  security: [{ apiKeyAuth: [] }],
  requestParams: { path: FileIdPathSchema },
  responses: {
    "200": {
      description: "The bounded preview or its unavailability reason.",
      content: { "application/json": { schema: RecordFilePreviewSchema } },
    },
    ...StructuredApiResponses,
  },
};

const uploadContentOperation: ZodOpenApiOperationObject = {
  operationId: "uploadFileContent",
  summary: "Send the bytes of a pending file",
  description: `${FILE_CONTRACT} The upload URL that \`/v1/files/uploads\` returns for workspaces that keep files in their database points here and carries a token, so no other credentials are needed. Send exactly the announced number of bytes; a shorter or longer body is refused with recordFileUploadIncomplete. Only the uploader can send the bytes, and only while the file is pending.\n\nRequires: the upload token or the uploader's API key`,
  tags: ["files"],
  security: FILE_SECURITY,
  requestParams: { path: FileIdPathSchema, query: z.object({ token: FileTokenSchema }) },
  requestBody: {
    required: true,
    content: { "application/octet-stream": { schema: BinarySchema } },
  },
  responses: {
    "200": {
      description: "The bytes are stored.",
      content: { "application/json": { schema: UploadRecordFileContentResultSchema } },
    },
    ...StructuredApiResponses,
  },
};

const downloadContentOperation: ZodOpenApiOperationObject = {
  operationId: "downloadFileContent",
  summary: "Download a file",
  description: `${FILE_CONTRACT} Streams the file with its stored media type. PDFs and PNG, JPEG, GIF and WebP images open in the browser unless download is 1; every other type downloads. Supports a single byte range. Access is checked on every request, also for a signed downloadUrl.\n\nRequires: read access to the record and the file field, or a valid download token`,
  tags: ["files"],
  security: FILE_SECURITY,
  requestParams: {
    path: FileIdPathSchema,
    query: z.object({
      token: FileTokenSchema,
      download: z.enum(["1"]).optional().describe("1 always downloads the file instead of showing it."),
    }),
    header: z.object({ range: z.string().optional().describe("A single byte range such as bytes=0-1023.") }),
  },
  responses: {
    "200": { description: "The whole file.", content: { "application/octet-stream": { schema: BinarySchema } } },
    "206": {
      description: "The requested byte range.",
      content: { "application/octet-stream": { schema: BinarySchema } },
    },
    "416": { description: "The range starts after the end of the file." },
    ...StructuredApiResponses,
  },
};

const renameFileOperation: ZodOpenApiOperationObject = {
  operationId: "renameFile",
  summary: "Rename a file",
  description: `${FILE_CONTRACT} Changes the name a file shows and downloads with. Folders are refused, control characters are removed and the name is cut to 255 characters; a name without an extension keeps the file's current one, so "Offer" renames "Draft.pdf" to "Offer.pdf". Renaming a file in a record's file field is a record update: it appears in the record's activity like any change of the field, but leaves the record version unchanged. Renaming a pending file is possible for the person who uploaded it. An empty or invalid name answers 400 with recordFileNameInvalid.\n\nRequires: update access to the record and the file field, or ownership of a pending upload`,
  tags: ["files"],
  security: [{ apiKeyAuth: [] }],
  requestParams: { path: FileIdPathSchema },
  requestBody: {
    required: true,
    content: {
      "application/json": {
        schema: RenameRecordFileSchema.omit({ fileId: true }),
        example: { name: "Signed offer.pdf" },
      },
    },
  },
  responses: {
    "200": {
      description: "The renamed file.",
      content: { "application/json": { schema: RecordFileDtoSchema } },
    },
    ...StructuredApiResponses,
  },
};

const attachOperation: ZodOpenApiOperationObject = {
  operationId: "attachFile",
  summary: "Attach a pending file to a record",
  description: `${FILE_CONTRACT} Writes a pending file you uploaded into a record's file field: a pending upload of that field, or a file you gave to Mate in a chat, which is not in any field yet. This is a record update, checked like \`/v1/records/mutate\`: mode append adds the file after the existing ones, replace keeps only this file, and expectedVersion guards against a concurrent change. Attaching a file that is already in that field returns it unchanged; a file in another record or field is refused with recordFileUnavailable. Once attached, access follows the record and the field. When the write continues in the background, operationId names the operation to read.\n\nRequires: update access to the record and the file field`,
  tags: ["files"],
  security: [{ apiKeyAuth: [] }],
  requestParams: { path: FileIdPathSchema },
  requestBody: {
    required: true,
    content: {
      "application/json": {
        schema: AttachRecordFileTargetSchema,
        example: {
          typeId: "0b6f3c1e-8a52-4c39-9d7e-2f4a6b8c1d01",
          recordId: "5d2a8c4e-1f3b-4a6d-8e9c-0b1a2c3d4e51",
          fieldId: "c7e1a3b5-2d4f-4a6c-9e8b-0f1a2b3c4d31",
          mode: "append",
        },
      },
    },
  },
  responses: {
    "200": {
      description: "The file and whether it is in the field now.",
      content: { "application/json": { schema: UploadRecordFileResultSchema } },
    },
    ...StructuredApiResponses,
  },
};

export const recordFileApiPaths = {
  "/v1/files/uploads": { post: createUploadOperation },
  "/v1/files/{id}": { get: getFileOperation, patch: renameFileOperation },
  "/v1/files/{id}/preview": { get: previewFileOperation },
  "/v1/files/{id}/attach": { post: attachOperation },
  "/v1/files/{id}/content": { get: downloadContentOperation, put: uploadContentOperation },
};
