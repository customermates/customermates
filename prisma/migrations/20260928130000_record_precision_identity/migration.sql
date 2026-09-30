ALTER TABLE "RecordValue" ALTER COLUMN "instantValue" TYPE TIMESTAMP(6);
ALTER TABLE "RecordLink" DROP CONSTRAINT "RecordLink_pkey";
ALTER TABLE "RecordLink" ADD CONSTRAINT "RecordLink_pkey" PRIMARY KEY ("companyId", "relationId", "id");
