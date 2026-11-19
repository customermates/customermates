-- Facebook Messenger as a messaging provider and as a contact identity.
-- ALTER TYPE ... ADD VALUE is safe inside Prisma's transaction on PostgreSQL 12+; nothing reads the value before
-- the deployment that carries this migration.
ALTER TYPE "MessagingProvider" ADD VALUE IF NOT EXISTS 'facebook' AFTER 'telegram';
ALTER TYPE "RecordIdentityProvider" ADD VALUE IF NOT EXISTS 'facebook' AFTER 'telegram';
