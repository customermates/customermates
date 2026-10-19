-- File fields keep their bytes outside RecordValue: RecordFile holds each upload's metadata and lifecycle,
-- RecordFileContent the parts the database storage driver writes, RecordFileChunk the extracted text for search.
CREATE TYPE "RecordFileStatus" AS ENUM ('pending', 'ready', 'detached');

CREATE TYPE "RecordFileExtractionStatus" AS ENUM ('pending', 'done', 'noText', 'unsupported', 'failed', 'skipped');

CREATE TABLE "RecordFile" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "typeId" TEXT NOT NULL,
  "fieldId" TEXT NOT NULL,
  "recordId" TEXT,
  "storageDriver" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "size" BIGINT NOT NULL,
  "sha256" TEXT,
  "status" "RecordFileStatus" NOT NULL DEFAULT 'pending',
  "uploadedById" TEXT,
  "extractionStatus" "RecordFileExtractionStatus" NOT NULL DEFAULT 'pending',
  "extractedText" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "attachedAt" TIMESTAMP(3),
  "detachedAt" TIMESTAMP(3),
  "indexedAt" TIMESTAMP(3),
  CONSTRAINT "RecordFile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RecordFile_storageKey_key" ON "RecordFile"("storageKey");
CREATE INDEX "RecordFile_companyId_status_createdAt_idx" ON "RecordFile"("companyId", "status", "createdAt");
CREATE INDEX "RecordFile_companyId_recordId_idx" ON "RecordFile"("companyId", "recordId");
CREATE INDEX "RecordFile_companyId_fieldId_idx" ON "RecordFile"("companyId", "fieldId");

-- Records and fields are deliberately not foreign keys: their deletion must remove the stored bytes too, which the
-- file lifecycle does before it deletes the rows.
ALTER TABLE "RecordFile" ADD CONSTRAINT "RecordFile_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecordFile" ADD CONSTRAINT "RecordFile_uploadedById_fkey"
  FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- An address keeps its parts in jsonValue and its formatted line in textValue, where search, sorting and the
-- contains filter read it; every other value still fills exactly one column.
ALTER TABLE "RecordValue" DROP CONSTRAINT "RecordValue_shape_check";
ALTER TABLE "RecordValue" ADD CONSTRAINT "RecordValue_shape_check" CHECK (
  ("state" = 'value' AND "errorCode" IS NULL AND (
    num_nonnulls("textValue", "decimalValue", "booleanValue", "instantValue", "jsonValue") + CASE WHEN cardinality("textListValue") > 0 THEN 1 ELSE 0 END = 1
    OR (
      num_nonnulls("decimalValue", "booleanValue", "instantValue") = 0 AND cardinality("textListValue") = 0
      AND "textValue" IS NOT NULL AND jsonb_typeof("jsonValue") = 'object' AND ("jsonValue" ->> 'formatted') IS NOT NULL
    )
  ))
  OR ("state" = 'missing' AND cardinality("textListValue") = 0 AND num_nonnulls("textValue", "decimalValue", "booleanValue", "instantValue", "jsonValue", "errorCode") = 0)
  OR ("state" = 'error' AND cardinality("textListValue") = 0 AND "errorCode" IS NOT NULL AND num_nonnulls("textValue", "decimalValue", "booleanValue", "instantValue", "jsonValue") = 0)
) NOT VALID;
ALTER TABLE "RecordValue" VALIDATE CONSTRAINT "RecordValue_shape_check";

CREATE TABLE "RecordFileContent" (
  "fileKey" TEXT NOT NULL,
  "part" INTEGER NOT NULL,
  "companyId" TEXT NOT NULL,
  "data" BYTEA NOT NULL,
  CONSTRAINT "RecordFileContent_pkey" PRIMARY KEY ("fileKey", "part")
);

CREATE INDEX "RecordFileContent_companyId_idx" ON "RecordFileContent"("companyId");

ALTER TABLE "RecordFileContent" ADD CONSTRAINT "RecordFileContent_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "RecordFileChunk" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "fileId" TEXT NOT NULL,
  "ordinal" INTEGER NOT NULL,
  "heading" TEXT,
  "text" TEXT NOT NULL,
  "searchVector" tsvector GENERATED ALWAYS AS (wiki_search_vector(COALESCE("heading", ''), "text")) STORED,
  "contentHash" TEXT NOT NULL,
  "embeddedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RecordFileChunk_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RecordFileChunk_fileId_ordinal_key" ON "RecordFileChunk"("fileId", "ordinal");
CREATE INDEX "RecordFileChunk_companyId_fileId_idx" ON "RecordFileChunk"("companyId", "fileId");
CREATE INDEX "RecordFileChunk_searchVector_idx" ON "RecordFileChunk" USING GIN ("searchVector");

ALTER TABLE "RecordFileChunk" ADD CONSTRAINT "RecordFileChunk_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecordFileChunk" ADD CONSTRAINT "RecordFileChunk_fileId_fkey"
  FOREIGN KEY ("fileId") REFERENCES "RecordFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- pgvector is optional: self-hosted databases without the extension keep full-text and typo search of file contents.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS vector;
  ALTER TABLE "RecordFileChunk" ADD COLUMN "embedding" vector(768);
EXCEPTION
  WHEN undefined_file OR insufficient_privilege OR feature_not_supported THEN
    RAISE NOTICE 'pgvector is unavailable, so file content search stays keyword-only on this database.';
END
$$;
