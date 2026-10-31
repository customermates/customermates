-- CreateTable
CREATE TABLE "MessagingFolderPassMessage" (
    "companyId" TEXT NOT NULL,
    "connectedAccountId" TEXT NOT NULL,
    "folderId" TEXT NOT NULL,
    "unipileMessageId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessagingFolderPassMessage_pkey" PRIMARY KEY ("connectedAccountId","folderId","unipileMessageId")
);

-- CreateIndex
CREATE INDEX "MessagingFolderPassMessage_companyId_idx" ON "MessagingFolderPassMessage"("companyId");

-- AddForeignKey
ALTER TABLE "MessagingFolderPassMessage" ADD CONSTRAINT "MessagingFolderPassMessage_connectedAccountId_fkey" FOREIGN KEY ("connectedAccountId") REFERENCES "ConnectedAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

