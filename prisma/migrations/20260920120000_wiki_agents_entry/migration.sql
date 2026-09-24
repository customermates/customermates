-- Prisma cannot represent a partial unique index predicate in schema.prisma.
-- AGENTS.md is the one conventional Wiki entry page inside each workspace.
UPDATE "WikiPage"
SET "title" = 'AGENTS.md'
WHERE lower(btrim("title")) = 'agents.md';

CREATE UNIQUE INDEX "WikiPage_companyId_agents_title_key"
ON "WikiPage" ("companyId")
WHERE lower(btrim("title")) = 'agents.md';
