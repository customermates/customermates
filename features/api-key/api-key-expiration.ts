export const API_KEY_EXPIRATION_SECONDS_PER_DAY = 24 * 60 * 60;
export const API_KEY_MIN_EXPIRATION_DAYS = 1;
export const API_KEY_MAX_EXPIRATION_DAYS = 365;
export const API_KEY_MIN_EXPIRATION_SECONDS = API_KEY_MIN_EXPIRATION_DAYS * API_KEY_EXPIRATION_SECONDS_PER_DAY;
export const API_KEY_MAX_EXPIRATION_SECONDS = API_KEY_MAX_EXPIRATION_DAYS * API_KEY_EXPIRATION_SECONDS_PER_DAY;

function localCalendarDay(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

export function getApiKeyExpirationSeconds(expiresAt: Date | null, today = new Date()): number | undefined {
  if (expiresAt === null) return undefined;

  const calendarDays =
    (localCalendarDay(expiresAt) - localCalendarDay(today)) / (API_KEY_EXPIRATION_SECONDS_PER_DAY * 1000);

  return calendarDays * API_KEY_EXPIRATION_SECONDS_PER_DAY;
}

export function isApiKeyExpirationDateAllowed(date: Date, today = new Date()): boolean {
  const expiresIn = getApiKeyExpirationSeconds(date, today);

  return (
    expiresIn !== undefined &&
    expiresIn >= API_KEY_MIN_EXPIRATION_SECONDS &&
    expiresIn <= API_KEY_MAX_EXPIRATION_SECONDS
  );
}
