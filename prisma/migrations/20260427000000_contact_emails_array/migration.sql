-- AlterTable: add emails array column
ALTER TABLE "Contact" ADD COLUMN "emails" TEXT[] NOT NULL DEFAULT '{}';

-- CreateIndex: GIN index for fast email lookups (= ANY, @>, &&)
CREATE INDEX "Contact_emails_idx" ON "Contact" USING GIN ("emails");
