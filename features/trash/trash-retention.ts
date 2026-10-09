export const TRASH_RETENTION_DAYS = 30;

const DAY = 24 * 60 * 60 * 1000;

export function trashDaysLeft(expiresAt: Date, now = Date.now()): number {
  return Math.max(0, Math.ceil((expiresAt.getTime() - now) / DAY));
}
