ALTER TABLE "WikiPage" DROP COLUMN IF EXISTS "searchHeadings";

DROP FUNCTION IF EXISTS wiki_search_headings(text, text);
DROP FUNCTION IF EXISTS wiki_search_words(text);
