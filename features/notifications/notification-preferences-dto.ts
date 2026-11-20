import type { NotificationPauseRepo } from "./notification-pause.repo";
import type { NotificationRepo } from "./notification.repo";
import type { NotificationPreferencesDto } from "./notification.schema";

import type { NotificationMailer } from "./notification-mailer";

import { pausedUntilDay } from "./notification-pause";
import { DEFAULT_NOTIFICATION_EMAIL_MODES, NOTIFICATION_KINDS } from "./notification.schema";

export type NotificationMail = Pick<NotificationMailer, "isConfigured">;

export const CONFIGURED_NOTIFICATION_MAIL: NotificationMail = { isConfigured: () => true };

export async function notificationPreferencesDto(
  repo: NotificationRepo,
  pauses: NotificationPauseRepo,
  now: Date,
  mail: NotificationMail,
): Promise<NotificationPreferencesDto> {
  const [rows, pause] = await Promise.all([repo.findPreferences(), pauses.find()]);
  const stored = new Map(rows.map((row) => [row.kind, row.emailMode]));
  return {
    preferences: NOTIFICATION_KINDS.map((kind) => ({
      kind,
      emailMode: stored.get(kind) ?? DEFAULT_NOTIFICATION_EMAIL_MODES[kind],
    })),
    pausedUntil: pausedUntilDay(pause, now),
    emailConfigured: mail.isConfigured(),
  };
}
