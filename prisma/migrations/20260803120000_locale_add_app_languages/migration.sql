-- Additive: no table is rewritten and no row changes. The AFTER clauses keep the
-- stored order equal to the declaration order in schema.prisma so migrate diff
-- stays empty, and no new value is referenced here, which is what makes
-- ALTER TYPE ... ADD VALUE safe inside Prisma's transaction on PostgreSQL 12+.
ALTER TYPE "Locale" ADD VALUE IF NOT EXISTS 'es' AFTER 'en';
ALTER TYPE "Locale" ADD VALUE IF NOT EXISTS 'fr' AFTER 'es';
ALTER TYPE "Locale" ADD VALUE IF NOT EXISTS 'it' AFTER 'fr';
