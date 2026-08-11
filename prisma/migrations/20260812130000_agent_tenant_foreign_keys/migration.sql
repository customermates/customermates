-- Scope the interface-command upsert key by tenant so the update branch cannot
-- reach another company's row.
DROP INDEX "AgentUiCommandResult_conversationId_commandId_key";

CREATE UNIQUE INDEX "AgentUiCommandResult_companyId_conversationId_commandId_key" ON "AgentUiCommandResult"("companyId", "conversationId", "commandId");

-- Credit usage is now read with companyId in the predicate.
DROP INDEX "AgentUsageEvent_userId_periodStart_periodEnd_state_idx";

CREATE INDEX "AgentUsageEvent_companyId_userId_periodStart_periodEnd_stat_idx" ON "AgentUsageEvent"("companyId", "userId", "periodStart", "periodEnd", "state");

-- Every other tenant-scoped model in the schema declares this relation; the
-- agent tables were the exception. AgentUsageEvent had no relation at all, so a
-- credit ledger row could name a company that does not exist.
ALTER TABLE "AgentMessage" ADD CONSTRAINT "AgentMessage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AgentUsageEvent" ADD CONSTRAINT "AgentUsageEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AgentTurnRequest" ADD CONSTRAINT "AgentTurnRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AgentWorkspaceSetup" ADD CONSTRAINT "AgentWorkspaceSetup_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AgentWorkspaceSetupResource" ADD CONSTRAINT "AgentWorkspaceSetupResource_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AgentApproval" ADD CONSTRAINT "AgentApproval_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AgentUiCommandResult" ADD CONSTRAINT "AgentUiCommandResult_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
