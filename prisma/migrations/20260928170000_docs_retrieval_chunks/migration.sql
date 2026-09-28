CREATE OR REPLACE FUNCTION docs_search_config(locale text) RETURNS regconfig
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = public, pg_catalog AS $$
  SELECT CASE locale
    WHEN 'de' THEN 'german'::regconfig
    WHEN 'es' THEN 'spanish'::regconfig
    WHEN 'fr' THEN 'french'::regconfig
    WHEN 'it' THEN 'italian'::regconfig
    ELSE 'english'::regconfig
  END
$$;

CREATE OR REPLACE FUNCTION docs_search_vector(locale text, label text, body text) RETURNS tsvector
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = public, pg_catalog AS $$
  SELECT
    setweight(to_tsvector('simple'::regconfig, label), 'A') ||
    setweight(to_tsvector(docs_search_config(locale), label), 'A') ||
    setweight(to_tsvector('simple'::regconfig, wiki_search_markdown_text(body)), 'C') ||
    setweight(to_tsvector(docs_search_config(locale), wiki_search_markdown_text(body)), 'C')
$$;

CREATE TABLE "DocsChunk" (
  "id" TEXT NOT NULL,
  "buildHash" TEXT NOT NULL,
  "locale" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "sectionOrder" INTEGER NOT NULL,
  "chunkOrdinal" INTEGER NOT NULL,
  "charOffset" INTEGER NOT NULL,
  "anchor" TEXT NOT NULL,
  "pageTitle" TEXT NOT NULL,
  "headingPath" TEXT[] NOT NULL,
  "label" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "contentHash" TEXT NOT NULL,
  "searchVector" tsvector GENERATED ALWAYS AS (docs_search_vector("locale", "label", "body")) STORED,
  "model" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DocsChunk_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DocsChunk_build_chunk_key"
  ON "DocsChunk"("buildHash", "locale", "source", "slug", "sectionOrder", "chunkOrdinal");
CREATE INDEX "DocsChunk_contentHash_idx" ON "DocsChunk"("contentHash");
CREATE INDEX "DocsChunk_searchVector_idx" ON "DocsChunk" USING GIN ("searchVector");

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS vector;
  ALTER TABLE "DocsChunk" ADD COLUMN "embedding" vector(768);
EXCEPTION
  WHEN undefined_file OR insufficient_privilege OR feature_not_supported THEN
    RAISE NOTICE 'pgvector is unavailable, so documentation search stays full-text only on this database.';
END
$$;
