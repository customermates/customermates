import { z } from "zod";

import type { BookingLinkDto, BookingLinkRow } from "./booking.schema";

import { BookingQuestionSchema } from "./booking.schema";
import { DEFAULT_WORKING_HOURS, WorkingHoursSchema } from "./working-hours";

const QuestionsSchema = z.array(BookingQuestionSchema);

export function bookingLinkUrl(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/$/u, "")}/book/${token}`;
}

export function storedWorkingHours(value: unknown) {
  const parsed = WorkingHoursSchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_WORKING_HOURS;
}

export function storedQuestions(value: unknown) {
  const parsed = QuestionsSchema.safeParse(value);
  return parsed.success ? parsed.data : [];
}

export function toBookingLinkDto(row: BookingLinkRow, baseUrl: string): BookingLinkDto {
  return {
    id: row.id,
    token: row.token,
    url: bookingLinkUrl(baseUrl, row.token),
    calendarId: row.calendarId,
    calendarName: row.calendarName,
    title: row.title,
    description: row.description,
    durationMinutes: row.durationMinutes,
    bufferMinutes: row.bufferMinutes,
    minNoticeMinutes: row.minNoticeMinutes,
    horizonDays: row.horizonDays,
    timeZone: row.timeZone,
    workingHours: storedWorkingHours(row.workingHours),
    withVideo: row.withVideo,
    personTypeId: row.personTypeId,
    recordTypeId: row.recordTypeId,
    startFieldId: row.startFieldId,
    questions: storedQuestions(row.questions),
    successMessage: row.successMessage,
    enabled: row.enabled,
    upcomingBookings: row.upcomingBookings,
    createdAt: row.createdAt.toISOString(),
  };
}
