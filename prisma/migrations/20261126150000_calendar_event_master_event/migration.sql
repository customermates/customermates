ALTER TABLE "CalendarEvent" ADD COLUMN "masterUnipileEventId" TEXT;

CREATE INDEX "CalendarEvent_connectedAccountId_masterUnipileEventId_idx" ON "CalendarEvent"("connectedAccountId", "masterUnipileEventId");
