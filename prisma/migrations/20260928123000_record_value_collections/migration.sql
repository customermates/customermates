ALTER TABLE "RecordValue" ADD COLUMN "textListValue" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "RecordValue" ADD COLUMN "lexicalValue" TEXT;

ALTER TABLE "RecordValue" DROP CONSTRAINT "RecordValue_shape_check";
ALTER TABLE "RecordValue" ADD CONSTRAINT "RecordValue_shape_check" CHECK (
  ("state" = 'value' AND num_nonnulls("textValue", "decimalValue", "booleanValue", "instantValue", "jsonValue") + CASE WHEN cardinality("textListValue") > 0 THEN 1 ELSE 0 END = 1 AND "errorCode" IS NULL)
  OR ("state" = 'missing' AND cardinality("textListValue") = 0 AND num_nonnulls("textValue", "decimalValue", "booleanValue", "instantValue", "jsonValue", "errorCode") = 0)
  OR ("state" = 'error' AND cardinality("textListValue") = 0 AND "errorCode" IS NOT NULL AND num_nonnulls("textValue", "decimalValue", "booleanValue", "instantValue", "jsonValue") = 0)
);
ALTER TABLE "RecordValue" ADD CONSTRAINT "RecordValue_lexical_check" CHECK ("lexicalValue" IS NULL OR "instantValue" IS NOT NULL);
CREATE INDEX "RecordValue_textListValue_idx" ON "RecordValue" USING GIN ("textListValue");
