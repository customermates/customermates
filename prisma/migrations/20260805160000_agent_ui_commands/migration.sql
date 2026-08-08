CREATE TABLE "AgentUiCommandResult" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "commandId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "result" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentUiCommandResult_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AgentRunLease" (
    "userId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentRunLease_pkey" PRIMARY KEY ("userId")
);

CREATE UNIQUE INDEX "AgentUiCommandResult_conversationId_commandId_key" ON "AgentUiCommandResult"("conversationId", "commandId");
CREATE INDEX "AgentUiCommandResult_companyId_idx" ON "AgentUiCommandResult"("companyId");
CREATE INDEX "AgentRunLease_companyId_idx" ON "AgentRunLease"("companyId");
CREATE INDEX "AgentRunLease_expiresAt_idx" ON "AgentRunLease"("expiresAt");

ALTER TABLE "AgentUiCommandResult" ADD CONSTRAINT "AgentUiCommandResult_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AgentConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentRunLease" ADD CONSTRAINT "AgentRunLease_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentRunLease" ADD CONSTRAINT "AgentRunLease_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
