ALTER TABLE "Widget" ADD COLUMN "measure" JSONB;
ALTER TABLE "Widget" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Widget" ADD CONSTRAINT "Widget_measure_shape_check" CHECK ("measure" IS NULL OR (kind = 'chart' AND jsonb_typeof("measure") = 'object'));
ALTER TABLE "Widget" ADD CONSTRAINT "Widget_version_positive_check" CHECK (version > 0);
CREATE INDEX "Widget_companyId_measure_typeId_idx" ON "Widget" ("companyId", ("measure"->'source'->>'typeId')) WHERE "measure" IS NOT NULL;
