-- The audit log is the canonical legal-notice and acceptance record.
CREATE INDEX "AuditLog_companyId_event_entityId_userId_idx"
ON "AuditLog"("companyId", "event", "entityId", "userId");
