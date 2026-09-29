ALTER TABLE "WikiSourceDocument" ADD COLUMN "readOffset" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "WikiSourceDocument" ADD CONSTRAINT "WikiSourceDocument_readOffset_nonnegative" CHECK ("readOffset" >= 0);
