-- Portuguese (Brazil), Polish and Dutch as application and content languages.
-- ALTER TYPE ... ADD VALUE safe inside Prisma's transaction on PostgreSQL 12+.
ALTER TYPE "Locale" ADD VALUE IF NOT EXISTS 'pt' AFTER 'it';
ALTER TYPE "Locale" ADD VALUE IF NOT EXISTS 'pl' AFTER 'pt';
ALTER TYPE "Locale" ADD VALUE IF NOT EXISTS 'nl' AFTER 'pl';

-- Docs and Knowledge Base search: stem Portuguese and Dutch with their own configurations. PostgreSQL ships no
-- Polish stemmer, so Polish uses 'simple'. Existing locales keep their configuration, so stored vectors stay valid.
CREATE OR REPLACE FUNCTION docs_search_config(locale text) RETURNS regconfig
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = public, pg_catalog AS $$
  SELECT CASE locale
    WHEN 'de' THEN 'german'::regconfig
    WHEN 'es' THEN 'spanish'::regconfig
    WHEN 'fr' THEN 'french'::regconfig
    WHEN 'it' THEN 'italian'::regconfig
    WHEN 'pt' THEN 'portuguese'::regconfig
    WHEN 'nl' THEN 'dutch'::regconfig
    WHEN 'pl' THEN 'simple'::regconfig
    ELSE 'english'::regconfig
  END
$$;
