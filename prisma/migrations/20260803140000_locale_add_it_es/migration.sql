-- Adds Italian and Spanish as application display languages.
--
-- Purely additive, exactly like the French migration that precedes it: no table
-- is rewritten and no existing row changes. The BEFORE clause keeps the stored
-- enum order identical to the declaration order in schema.prisma, so a later
-- prisma migrate diff reports no drift.
--
-- Neither new value is referenced anywhere in this migration, which is what makes
-- ALTER TYPE ... ADD VALUE safe inside Prisma's transaction on PostgreSQL 12+.
ALTER TYPE "Locale" ADD VALUE IF NOT EXISTS 'es' BEFORE 'fr';
ALTER TYPE "Locale" ADD VALUE IF NOT EXISTS 'it' AFTER 'fr';
