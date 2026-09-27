CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE OR REPLACE FUNCTION wiki_search_markdown_text(markdown text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path FROM CURRENT AS $$
  SELECT regexp_replace(markdown, E'\\]\\([^)\\n]*\\)', ']', 'g')
$$;

CREATE OR REPLACE FUNCTION wiki_search_heading_text(markdown text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path FROM CURRENT AS $$
  SELECT btrim(
    regexp_replace(
      regexp_replace(
        regexp_replace(wiki_search_markdown_text(markdown), E'^(?!#{1,6}[ \\t]).*$', '', 'gn'),
        E'^#{1,6}[ \\t]+', '', 'gn'
      ),
      E'\\n{2,}', E'\n', 'g'
    ),
    E'\n'
  )
$$;

CREATE OR REPLACE FUNCTION wiki_search_headings(title text, markdown text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path FROM CURRENT AS $$
  SELECT lower(title || E'\n' || wiki_search_heading_text(markdown))
$$;

CREATE OR REPLACE FUNCTION wiki_search_weighted_vector(content text, weight "char") RETURNS tsvector
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path FROM CURRENT AS $$
  SELECT
    setweight(to_tsvector('simple'::regconfig, content), weight) ||
    setweight(to_tsvector('english'::regconfig, content), weight) ||
    setweight(to_tsvector('german'::regconfig, content), weight) ||
    setweight(to_tsvector('spanish'::regconfig, content), weight) ||
    setweight(to_tsvector('french'::regconfig, content), weight) ||
    setweight(to_tsvector('italian'::regconfig, content), weight)
$$;

CREATE OR REPLACE FUNCTION wiki_search_vector(title text, markdown text) RETURNS tsvector
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path FROM CURRENT AS $$
  SELECT
    wiki_search_weighted_vector(title, 'A') ||
    wiki_search_weighted_vector(wiki_search_heading_text(markdown), 'B') ||
    wiki_search_weighted_vector(wiki_search_markdown_text(markdown), 'C')
$$;

CREATE OR REPLACE FUNCTION wiki_search_words(content text) RETURNS SETOF text
LANGUAGE sql IMMUTABLE PARALLEL SAFE ROWS 16 SET search_path = pg_catalog AS $$
  SELECT w FROM regexp_split_to_table(lower(content), '[^[:alnum:]]+') AS w WHERE w <> ''
$$;

CREATE OR REPLACE FUNCTION wiki_search_sorted_letters(word text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = pg_catalog AS $$
  SELECT string_agg(c, '' ORDER BY c COLLATE "C") FROM regexp_split_to_table(word, '') AS c
$$;

ALTER TABLE "WikiPage"
  ADD COLUMN "searchHeadings" TEXT GENERATED ALWAYS AS (wiki_search_headings("title", "markdown")) STORED;

ALTER TABLE "WikiPage"
  ADD COLUMN "searchVector" tsvector GENERATED ALWAYS AS (wiki_search_vector("title", "markdown")) STORED;

CREATE INDEX "WikiPage_searchVector_idx" ON "WikiPage" USING GIN ("searchVector");
