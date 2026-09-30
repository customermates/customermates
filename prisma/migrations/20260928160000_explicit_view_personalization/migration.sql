ALTER TABLE "P13n" ADD COLUMN "viewStateKeys" JSONB;
ALTER TABLE "P13n" ADD CONSTRAINT "P13n_viewStateKeys_array" CHECK ("viewStateKeys" IS NULL OR jsonb_typeof("viewStateKeys") = 'array');
