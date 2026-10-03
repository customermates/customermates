ALTER TABLE "RecordValue" ADD COLUMN "rangeStart" TIMESTAMP(6), ADD COLUMN "rangeEnd" TIMESTAMP(6);

UPDATE "RecordValue" value SET
  "rangeStart" = (value."jsonValue"->>'start')::timestamptz AT TIME ZONE 'UTC',
  "rangeEnd" = (value."jsonValue"->>'end')::timestamptz AT TIME ZONE 'UTC'
FROM "RecordFieldDefinition" field
WHERE field."companyId" = value."companyId" AND field."typeId" = value."typeId" AND field.id = value."fieldId"
  AND field.definition->>'valueType' IN ('dateRange', 'dateTimeRange') AND value.state = 'value';

CREATE INDEX "RecordValue_companyId_typeId_fieldId_rangeStart_recordId_idx" ON "RecordValue" ("companyId", "typeId", "fieldId", "rangeStart", "recordId");
CREATE INDEX "RecordValue_companyId_typeId_fieldId_rangeEnd_recordId_idx" ON "RecordValue" ("companyId", "typeId", "fieldId", "rangeEnd", "recordId");
