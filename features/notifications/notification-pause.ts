export const NOTIFICATION_PAUSE_MAX_DAYS = 365;

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/u;
const DAY_MS = 24 * 60 * 60 * 1000;

export function notificationPauseEnd(day: string): Date | null {
  const match = ISO_DAY.exec(day);
  if (!match) return null;
  const end = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  const valid =
    end.getUTCFullYear() === Number(match[1]) &&
    end.getUTCMonth() === Number(match[2]) - 1 &&
    end.getUTCDate() === Number(match[3]);
  return valid ? end : null;
}

export function notificationPauseEndIsAllowed(end: Date, now: Date): boolean {
  return end.getTime() > now.getTime() && end.getTime() <= now.getTime() + NOTIFICATION_PAUSE_MAX_DAYS * DAY_MS;
}

export function isNotificationPaused(until: Date | null | undefined, now: Date): boolean {
  return until !== null && until !== undefined && until.getTime() > now.getTime();
}

export function pausedUntilDay(until: Date | null | undefined, now: Date): string | null {
  return isNotificationPaused(until, now) ? (until as Date).toISOString().slice(0, 10) : null;
}
