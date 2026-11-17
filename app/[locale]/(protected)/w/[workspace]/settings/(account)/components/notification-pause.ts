import type { NotificationEmailMode, NotificationKind } from "@/generated/prisma";

import { DEFAULT_NOTIFICATION_EMAIL_MODES, NOTIFICATION_KINDS } from "@/features/notifications/notification.schema";

export const NOTIFICATION_PAUSE_STORAGE_KEY = "customermates:notification-pause";

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/u;
const MODES: readonly NotificationEmailMode[] = ["instant", "digest", "off"];

export type NotificationModes = Record<NotificationKind, NotificationEmailMode>;

export type NotificationPause = { until: string; previous: Partial<NotificationModes> };

function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.getMonth() === Number(match[2]) - 1 && date.getDate() === Number(match[3]);
}

export function isoDateOf(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function dateOfIso(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function addDaysToIso(value: string, days: number): string {
  const date = dateOfIso(value);
  date.setDate(date.getDate() + days);
  return isoDateOf(date);
}

export function parseNotificationPause(raw: string | null): NotificationPause | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const { until, previous } = parsed as { until?: unknown; previous?: unknown };
    if (!isIsoDate(until) || !previous || typeof previous !== "object") return null;
    const modes: Partial<NotificationModes> = {};
    for (const kind of NOTIFICATION_KINDS) {
      const mode = (previous as Record<string, unknown>)[kind];
      if (typeof mode === "string" && MODES.some((candidate) => candidate === mode))
        modes[kind] = mode as NotificationEmailMode;
    }
    return { until, previous: modes };
  } catch {
    return null;
  }
}

export function serializeNotificationPause(pause: NotificationPause): string {
  return JSON.stringify(pause);
}

export function isNotificationPauseOver(pause: NotificationPause, today: string): boolean {
  return today >= pause.until;
}

export function pausedModes(): NotificationModes {
  return { dueToday: "off", replyReceived: "off", ruleAlert: "off" };
}

export function restoredModes(pause: NotificationPause): NotificationModes {
  const restored = { ...DEFAULT_NOTIFICATION_EMAIL_MODES } as NotificationModes;
  for (const kind of NOTIFICATION_KINDS) {
    const mode = pause.previous[kind];
    if (mode) restored[kind] = mode;
  }
  return restored;
}

export function modesToPreferences(modes: NotificationModes) {
  return NOTIFICATION_KINDS.map((kind) => ({ kind, emailMode: modes[kind] }));
}

export function rememberModes(preferences: { kind: NotificationKind; emailMode: NotificationEmailMode }[]) {
  const previous: Partial<NotificationModes> = {};
  for (const preference of preferences) previous[preference.kind] = preference.emailMode;
  return previous;
}
