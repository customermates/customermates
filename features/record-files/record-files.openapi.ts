import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import { StructuredApiResponses } from "@/core/api/structured-interactor-handler";
import { structuredOperation } from "@/core/openapi/structured-operation";
import {
  CreateRecordFileUploadResultSchema,
  CreateRecordFileUploadSchema,
  RecordFileReadResultSchema,
  UploadRecordFileContentResultSchema,
} from "./record-file.schema";

const FILE_CONTRACT =
  "Files of file fields. Upload in three steps: start an upload, send the bytes to the returned URL, then write the file id into the file field with `/v1/records/mutate`. Access to a file follows read access to its record and field.";

const FileIdPathSchema = z.object({ fileId: z.uuid().describe("Id of the file.") });
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

export const recordFileApiPaths = {
  "/v1/files/uploads": { post: createUploadOperation },
  "/v1/files/{fileId}": { get: getFileOperation },
  "/v1/files/{fileId}/content": { get: downloadContentOperation, put: uploadContentOperation },
};
