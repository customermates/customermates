CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- AlterEnum
ALTER TYPE "Resource" ADD VALUE 'dataModel';

-- CreateTable
CREATE TABLE "RecordSchemaState" (
    "companyId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "activeOperationId" TEXT,
    "storageMode" TEXT NOT NULL DEFAULT 'legacy',

    CONSTRAINT "RecordSchemaState_pkey" PRIMARY KEY ("companyId")
);

-- CreateTable
CREATE TABLE "RecordTypeDefinition" (
    "companyId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "presetKey" TEXT,
    "label" TEXT NOT NULL,
    "pluralLabel" TEXT NOT NULL,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "embedded" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "definition" JSONB NOT NULL,
    "capabilities" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecordTypeDefinition_pkey" PRIMARY KEY ("companyId","id")
);

-- CreateTable
CREATE TABLE "RecordFieldDefinition" (
    "companyId" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "valueType" TEXT NOT NULL,
    "behavior" TEXT NOT NULL,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "definition" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecordFieldDefinition_pkey" PRIMARY KEY ("companyId","id")
);

-- CreateTable
CREATE TABLE "RecordRelationshipDefinition" (
    "companyId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "sourceTypeId" TEXT NOT NULL,
    "targetTypeId" TEXT NOT NULL,
    "definition" JSONB NOT NULL,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecordRelationshipDefinition_pkey" PRIMARY KEY ("companyId","id")
);

-- CreateTable
CREATE TABLE "CrmRecord" (
    "companyId" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "protectedKind" TEXT,
    "systemData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmRecord_pkey" PRIMARY KEY ("companyId","typeId","id")
);

-- CreateTable
CREATE TABLE "RecordValue" (
    "companyId" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'missing',
    "textValue" TEXT,
    "decimalValue" DECIMAL(65,30),
    "currency" TEXT,
    "booleanValue" BOOLEAN,
    "instantValue" TIMESTAMP(3),
    "jsonValue" JSONB,
    "errorCode" TEXT,
    "schemaRevision" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecordValue_pkey" PRIMARY KEY ("companyId","typeId","recordId","fieldId")
);

-- CreateTable
CREATE TABLE "RecordValueDependency" (
    "companyId" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "sourceTypeId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,

    CONSTRAINT "RecordValueDependency_pkey" PRIMARY KEY ("companyId","typeId","recordId","fieldId","sourceTypeId","sourceId")
);

-- CreateTable
CREATE TABLE "RecordLink" (
    "companyId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "relationId" TEXT NOT NULL,
    "sourceTypeId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "targetTypeId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecordLink_pkey" PRIMARY KEY ("companyId","id")
);

-- CreateTable
CREATE TABLE "RecordAssignment" (
    "companyId" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecordAssignment_pkey" PRIMARY KEY ("companyId","typeId","recordId","userId")
);

-- CreateTable
CREATE TABLE "RecordTypeGrant" (
    "companyId" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "actions" "Action"[],

    CONSTRAINT "RecordTypeGrant_pkey" PRIMARY KEY ("companyId","typeId","roleId")
);

-- CreateTable
CREATE TABLE "RecordSchemaRevision" (
    "companyId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "actorId" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecordSchemaRevision_pkey" PRIMARY KEY ("companyId","revision")
);

-- CreateTable
CREATE TABLE "RecordOperation" (
    "companyId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'pending',
    "expectedRevision" INTEGER NOT NULL,
    "request" JSONB NOT NULL,
    "stagedSchema" JSONB,
    "result" JSONB,
    "errorCode" TEXT,
    "cursor" JSONB,
    "processed" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL DEFAULT 0,
    "leaseUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecordOperation_pkey" PRIMARY KEY ("companyId","id")
);

-- CreateTable
CREATE TABLE "RecordStageRow" (
    "companyId" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "payload" JSONB NOT NULL,

    CONSTRAINT "RecordStageRow_pkey" PRIMARY KEY ("companyId","operationId","kind","key")
);

-- CreateTable
CREATE TABLE "RecordMutationReceipt" (
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecordMutationReceipt_pkey" PRIMARY KEY ("companyId","userId","idempotencyKey")
);

-- CreateTable
CREATE TABLE "RecordEvent" (
    "companyId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "causeId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecordEvent_pkey" PRIMARY KEY ("companyId","id")
);

-- CreateIndex
CREATE INDEX "RecordTypeDefinition_companyId_archived_position_idx" ON "RecordTypeDefinition"("companyId", "archived", "position");

-- CreateIndex
CREATE UNIQUE INDEX "RecordTypeDefinition_companyId_presetKey_key" ON "RecordTypeDefinition"("companyId", "presetKey");

-- CreateIndex
CREATE INDEX "RecordFieldDefinition_companyId_typeId_archived_idx" ON "RecordFieldDefinition"("companyId", "typeId", "archived");

-- CreateIndex
CREATE UNIQUE INDEX "RecordFieldDefinition_companyId_typeId_id_key" ON "RecordFieldDefinition"("companyId", "typeId", "id");

-- CreateIndex
CREATE INDEX "RecordRelationshipDefinition_companyId_sourceTypeId_idx" ON "RecordRelationshipDefinition"("companyId", "sourceTypeId");

-- CreateIndex
CREATE INDEX "RecordRelationshipDefinition_companyId_targetTypeId_idx" ON "RecordRelationshipDefinition"("companyId", "targetTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "RecordRelationshipDefinition_companyId_id_sourceTypeId_targ_key" ON "RecordRelationshipDefinition"("companyId", "id", "sourceTypeId", "targetTypeId");

-- CreateIndex
CREATE INDEX "CrmRecord_companyId_typeId_createdAt_id_idx" ON "CrmRecord"("companyId", "typeId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "CrmRecord_companyId_typeId_updatedAt_id_idx" ON "CrmRecord"("companyId", "typeId", "updatedAt", "id");

-- CreateIndex
CREATE INDEX "RecordValue_companyId_typeId_fieldId_recordId_idx" ON "RecordValue"("companyId", "typeId", "fieldId", "recordId");

-- CreateIndex
CREATE INDEX "RecordValue_textValue_idx" ON "RecordValue" USING GIN ("textValue" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "RecordValue_companyId_typeId_fieldId_decimalValue_recordId_idx" ON "RecordValue"("companyId", "typeId", "fieldId", "decimalValue", "recordId");

-- CreateIndex
CREATE INDEX "RecordValue_companyId_typeId_fieldId_instantValue_recordId_idx" ON "RecordValue"("companyId", "typeId", "fieldId", "instantValue", "recordId");

-- CreateIndex
CREATE INDEX "RecordValue_companyId_typeId_fieldId_booleanValue_recordId_idx" ON "RecordValue"("companyId", "typeId", "fieldId", "booleanValue", "recordId");

-- CreateIndex
CREATE INDEX "RecordValueDependency_companyId_sourceTypeId_sourceId_idx" ON "RecordValueDependency"("companyId", "sourceTypeId", "sourceId");

-- CreateIndex
CREATE INDEX "RecordLink_companyId_sourceTypeId_sourceId_relationId_idx" ON "RecordLink"("companyId", "sourceTypeId", "sourceId", "relationId");

-- CreateIndex
CREATE INDEX "RecordLink_companyId_targetTypeId_targetId_relationId_idx" ON "RecordLink"("companyId", "targetTypeId", "targetId", "relationId");

-- CreateIndex
CREATE UNIQUE INDEX "RecordLink_companyId_relationId_sourceId_targetId_key" ON "RecordLink"("companyId", "relationId", "sourceId", "targetId");

-- CreateIndex
CREATE INDEX "RecordAssignment_companyId_userId_typeId_recordId_idx" ON "RecordAssignment"("companyId", "userId", "typeId", "recordId");

-- CreateIndex
CREATE INDEX "RecordTypeGrant_companyId_roleId_idx" ON "RecordTypeGrant"("companyId", "roleId");

-- CreateIndex
CREATE INDEX "RecordOperation_companyId_state_createdAt_idx" ON "RecordOperation"("companyId", "state", "createdAt");

-- CreateIndex
CREATE INDEX "RecordOperation_state_leaseUntil_idx" ON "RecordOperation"("state", "leaseUntil");

-- CreateIndex
CREATE INDEX "RecordEvent_companyId_typeId_recordId_createdAt_idx" ON "RecordEvent"("companyId", "typeId", "recordId", "createdAt");

-- CreateIndex
CREATE INDEX "RecordEvent_deliveredAt_nextAttemptAt_idx" ON "RecordEvent"("deliveredAt", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_companyId_id_key" ON "User"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "UserRole_companyId_id_key" ON "UserRole"("companyId", "id");

-- AddForeignKey
ALTER TABLE "RecordSchemaState" ADD CONSTRAINT "RecordSchemaState_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordTypeDefinition" ADD CONSTRAINT "RecordTypeDefinition_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordFieldDefinition" ADD CONSTRAINT "RecordFieldDefinition_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordFieldDefinition" ADD CONSTRAINT "RecordFieldDefinition_companyId_typeId_fkey" FOREIGN KEY ("companyId", "typeId") REFERENCES "RecordTypeDefinition"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordRelationshipDefinition" ADD CONSTRAINT "RecordRelationshipDefinition_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordRelationshipDefinition" ADD CONSTRAINT "RecordRelationshipDefinition_companyId_sourceTypeId_fkey" FOREIGN KEY ("companyId", "sourceTypeId") REFERENCES "RecordTypeDefinition"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordRelationshipDefinition" ADD CONSTRAINT "RecordRelationshipDefinition_companyId_targetTypeId_fkey" FOREIGN KEY ("companyId", "targetTypeId") REFERENCES "RecordTypeDefinition"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmRecord" ADD CONSTRAINT "CrmRecord_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmRecord" ADD CONSTRAINT "CrmRecord_companyId_typeId_fkey" FOREIGN KEY ("companyId", "typeId") REFERENCES "RecordTypeDefinition"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordValue" ADD CONSTRAINT "RecordValue_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordValue" ADD CONSTRAINT "RecordValue_companyId_typeId_recordId_fkey" FOREIGN KEY ("companyId", "typeId", "recordId") REFERENCES "CrmRecord"("companyId", "typeId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordValue" ADD CONSTRAINT "RecordValue_companyId_typeId_fieldId_fkey" FOREIGN KEY ("companyId", "typeId", "fieldId") REFERENCES "RecordFieldDefinition"("companyId", "typeId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordValueDependency" ADD CONSTRAINT "RecordValueDependency_companyId_typeId_recordId_fieldId_fkey" FOREIGN KEY ("companyId", "typeId", "recordId", "fieldId") REFERENCES "RecordValue"("companyId", "typeId", "recordId", "fieldId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordLink" ADD CONSTRAINT "RecordLink_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordLink" ADD CONSTRAINT "RecordLink_companyId_relationId_sourceTypeId_targetTypeId_fkey" FOREIGN KEY ("companyId", "relationId", "sourceTypeId", "targetTypeId") REFERENCES "RecordRelationshipDefinition"("companyId", "id", "sourceTypeId", "targetTypeId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordLink" ADD CONSTRAINT "RecordLink_companyId_sourceTypeId_sourceId_fkey" FOREIGN KEY ("companyId", "sourceTypeId", "sourceId") REFERENCES "CrmRecord"("companyId", "typeId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordLink" ADD CONSTRAINT "RecordLink_companyId_targetTypeId_targetId_fkey" FOREIGN KEY ("companyId", "targetTypeId", "targetId") REFERENCES "CrmRecord"("companyId", "typeId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordAssignment" ADD CONSTRAINT "RecordAssignment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordAssignment" ADD CONSTRAINT "RecordAssignment_companyId_typeId_recordId_fkey" FOREIGN KEY ("companyId", "typeId", "recordId") REFERENCES "CrmRecord"("companyId", "typeId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordAssignment" ADD CONSTRAINT "RecordAssignment_companyId_userId_fkey" FOREIGN KEY ("companyId", "userId") REFERENCES "User"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordTypeGrant" ADD CONSTRAINT "RecordTypeGrant_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordTypeGrant" ADD CONSTRAINT "RecordTypeGrant_companyId_typeId_fkey" FOREIGN KEY ("companyId", "typeId") REFERENCES "RecordTypeDefinition"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordTypeGrant" ADD CONSTRAINT "RecordTypeGrant_companyId_roleId_fkey" FOREIGN KEY ("companyId", "roleId") REFERENCES "UserRole"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordSchemaRevision" ADD CONSTRAINT "RecordSchemaRevision_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordOperation" ADD CONSTRAINT "RecordOperation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordStageRow" ADD CONSTRAINT "RecordStageRow_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordStageRow" ADD CONSTRAINT "RecordStageRow_companyId_operationId_fkey" FOREIGN KEY ("companyId", "operationId") REFERENCES "RecordOperation"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordMutationReceipt" ADD CONSTRAINT "RecordMutationReceipt_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordEvent" ADD CONSTRAINT "RecordEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RecordValue" ADD CONSTRAINT "RecordValue_shape_check" CHECK (
    ("state" = 'value' AND num_nonnulls("textValue", "decimalValue", "booleanValue", "instantValue", "jsonValue") = 1 AND "errorCode" IS NULL)
    OR ("state" = 'missing' AND num_nonnulls("textValue", "decimalValue", "booleanValue", "instantValue", "jsonValue", "errorCode") = 0)
    OR ("state" = 'error' AND "errorCode" IS NOT NULL AND num_nonnulls("textValue", "decimalValue", "booleanValue", "instantValue", "jsonValue") = 0)
);
ALTER TABLE "RecordValue" ADD CONSTRAINT "RecordValue_currency_check" CHECK ("currency" IS NULL OR ("decimalValue" IS NOT NULL AND "currency" ~ '^[A-Z]{3}$'));
ALTER TABLE "RecordValue" ADD CONSTRAINT "RecordValue_decimal_check" CHECK ("decimalValue" IS NULL OR "decimalValue" <> 'NaN'::numeric);
ALTER TABLE "CrmRecord" ADD CONSTRAINT "CrmRecord_version_check" CHECK ("version" > 0);
