import { isIanaTimeZone } from "@/core/utils/time-zone";
import { addCalendarDays, isCalendarDate } from "@/features/record-calendar/calendar-date";
import { zonedDate, zonedInstant } from "@/features/record-calendar/zoned-time";

export const NOTIFICATION_PAUSE_MAX_DAYS = 365;
export const NOTIFICATION_PAUSE_DEFAULT_TIME_ZONE = "UTC";

const START_OF_DAY = { hour: 0, minute: 0, second: 0, millisecond: 0 };

export type NotificationPauseState = { until: Date; timeZone: string };

export function notificationPauseEnd(day: string, timeZone: string): Date | null {
  if (!isCalendarDate(day) || !isIanaTimeZone(timeZone)) return null;
  return zonedInstant(day, START_OF_DAY, timeZone);
}

export function notificationPauseEndIsAllowed(day: string, timeZone: string, now: Date): boolean {
  const today = zonedDate(now, timeZone);
  return day > today && day <= addCalendarDays(today, NOTIFICATION_PAUSE_MAX_DAYS);
}

export function isNotificationPaused(until: Date | null | undefined, now: Date): boolean {
  return until !== null && until !== undefined && until.getTime() > now.getTime();
}

export function pausedUntilDay(pause: NotificationPauseState | null | undefined, now: Date): string | null {
  if (!pause || !isNotificationPaused(pause.until, now)) return null;
  return zonedDate(pause.until, isIanaTimeZone(pause.timeZone) ? pause.timeZone : NOTIFICATION_PAUSE_DEFAULT_TIME_ZONE);
}
