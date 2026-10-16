-- Files given to Mate in a chat are pending record files without a file field until Mate or the user files them
-- onto a record: list and field stay empty until then, conversationId keeps them for the chat they were sent in.
ALTER TABLE "RecordFile" ALTER COLUMN "typeId" DROP NOT NULL;
ALTER TABLE "RecordFile" ALTER COLUMN "fieldId" DROP NOT NULL;
ALTER TABLE "RecordFile" ADD COLUMN "conversationId" TEXT;
-- Text extraction records the page count of a PDF so Mate can pass short PDFs to the model as files.
ALTER TABLE "RecordFile" ADD COLUMN "pageCount" INTEGER;

-- A file is in a field with both its list and field, or in neither; only a file in a field can be ready.
ALTER TABLE "RecordFile" ADD CONSTRAINT "RecordFile_field_valid"
  CHECK (("typeId" IS NULL) = ("fieldId" IS NULL) AND ("fieldId" IS NOT NULL OR "status" <> 'ready'));
ALTER TABLE "RecordFile" ADD CONSTRAINT "RecordFile_pageCount_valid" CHECK ("pageCount" IS NULL OR "pageCount" >= 0);

-- Chat cleanup and the send path find a chat's unfiled files without scanning the workspace's other files.
CREATE INDEX "RecordFile_companyId_conversationId_idx" ON "RecordFile"("companyId", "conversationId");
