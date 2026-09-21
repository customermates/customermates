-- AGENTS.md is an ordinary Wiki title; keep the historical migration intact for
-- databases that already applied it, then remove only its uniqueness constraint.
DROP INDEX IF EXISTS "WikiPage_companyId_agents_title_key";
