-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('reserved', 'confirmed', 'cancelled');

-- CreateTable
CREATE TABLE "CalendarEventRecordLink" (
    "companyId" TEXT NOT NULL,
    "calendarEventId" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalendarEventRecordLink_pkey" PRIMARY KEY ("companyId","calendarEventId","typeId","recordId")
);

-- CreateTable
CREATE TABLE "BookingLink" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "calendarId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "durationMinutes" INTEGER NOT NULL,
    "bufferMinutes" INTEGER NOT NULL DEFAULT 0,
    "minNoticeMinutes" INTEGER NOT NULL DEFAULT 240,
    "horizonDays" INTEGER NOT NULL DEFAULT 30,
    "timeZone" TEXT NOT NULL,
    "workingHours" JSONB NOT NULL,
    "withVideo" BOOLEAN NOT NULL DEFAULT false,
    "personTypeId" TEXT,
    "recordTypeId" TEXT,
    "startFieldId" TEXT,
    "questions" JSONB NOT NULL DEFAULT '[]',
    "successMessage" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "bookingLinkId" TEXT NOT NULL,
    "calendarEventId" TEXT,
    "slotKey" TEXT,
    "status" "BookingStatus" NOT NULL DEFAULT 'reserved',
    "inviteeName" TEXT NOT NULL,
    "inviteeEmail" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "timeZone" TEXT NOT NULL,
    "answers" JSONB NOT NULL DEFAULT '{}',
    "personTypeId" TEXT,
    "personRecordId" TEXT,
    "recordTypeId" TEXT,
    "recordId" TEXT,
    "ipHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CalendarEvent_companyId_id_key" ON "CalendarEvent"("companyId", "id");

-- CreateIndex
CREATE INDEX "CalendarEventRecordLink_companyId_typeId_recordId_idx" ON "CalendarEventRecordLink"("companyId", "typeId", "recordId");

-- CreateIndex
CREATE UNIQUE INDEX "BookingLink_token_key" ON "BookingLink"("token");

-- CreateIndex
CREATE INDEX "BookingLink_companyId_userId_idx" ON "BookingLink"("companyId", "userId");

-- CreateIndex
CREATE INDEX "BookingLink_calendarId_idx" ON "BookingLink"("calendarId");

-- CreateIndex
CREATE UNIQUE INDEX "BookingLink_companyId_id_key" ON "BookingLink"("companyId", "id");

-- CreateIndex
CREATE INDEX "Booking_companyId_bookingLinkId_startsAt_idx" ON "Booking"("companyId", "bookingLinkId", "startsAt");

-- CreateIndex
CREATE INDEX "Booking_companyId_inviteeEmail_idx" ON "Booking"("companyId", "inviteeEmail");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_bookingLinkId_slotKey_key" ON "Booking"("bookingLinkId", "slotKey");

-- AddForeignKey
ALTER TABLE "CalendarEventRecordLink" ADD CONSTRAINT "CalendarEventRecordLink_companyId_calendarEventId_fkey" FOREIGN KEY ("companyId", "calendarEventId") REFERENCES "CalendarEvent"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEventRecordLink" ADD CONSTRAINT "CalendarEventRecordLink_companyId_typeId_recordId_fkey" FOREIGN KEY ("companyId", "typeId", "recordId") REFERENCES "CrmRecord"("companyId", "typeId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEventRecordLink" ADD CONSTRAINT "CalendarEventRecordLink_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingLink" ADD CONSTRAINT "BookingLink_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingLink" ADD CONSTRAINT "BookingLink_companyId_userId_fkey" FOREIGN KEY ("companyId", "userId") REFERENCES "User"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingLink" ADD CONSTRAINT "BookingLink_calendarId_fkey" FOREIGN KEY ("calendarId") REFERENCES "Calendar"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_companyId_bookingLinkId_fkey" FOREIGN KEY ("companyId", "bookingLinkId") REFERENCES "BookingLink"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
