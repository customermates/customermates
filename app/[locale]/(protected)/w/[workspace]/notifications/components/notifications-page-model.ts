import type { NotificationDto } from "@/features/notifications/notification.schema";

import { NOTIFICATION_KINDS } from "@/features/notifications/notification.schema";

export const NOTIFICATIONS_PAGE_SIZE = 25;

export type NotificationKindFilter = "all" | (typeof NOTIFICATION_KINDS)[number];

export const NOTIFICATION_KIND_FILTERS = [
  "all",
  ...NOTIFICATION_KINDS,
] as const satisfies readonly NotificationKindFilter[];

export type NotificationDayGroup = { key: string; date: Date; items: NotificationDto[] };

export function isListedNotificationKind(kind: string): kind is (typeof NOTIFICATION_KINDS)[number] {
  return (NOTIFICATION_KINDS as readonly string[]).includes(kind);
}

export function filterNotificationsByKind(items: readonly NotificationDto[], kind: NotificationKindFilter) {
  return kind === "all" ? [...items] : items.filter((item) => item.kind === kind);
}

function dayKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export function isSameNotificationDay(a: Date, b: Date) {
  return dayKey(a) === dayKey(b);
}

export function groupNotificationsByDay(items: readonly NotificationDto[]): NotificationDayGroup[] {
  const groups: NotificationDayGroup[] = [];
  for (const item of items) {
    const date = new Date(item.createdAt);
    const current = groups.at(-1);
    if (current && isSameNotificationDay(current.date, date)) {
      current.items.push(item);
      continue;
    }
    groups.push({ key: `${dayKey(date)}:${item.id}`, date, items: [item] });
  }
  return groups;
}

export function resolveNotificationDayLabel(
  date: Date,
  now: Date,
  labels: { today: string; yesterday: string },
  formatDate: (date: Date) => string,
) {
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameNotificationDay(date, now)) return labels.today;
  if (isSameNotificationDay(date, yesterday)) return labels.yesterday;
  return formatDate(date);
}

export type NotificationPage = { items: NotificationDto[]; nextBefore: string | null };

export function mergeNewestPage(current: NotificationPage, newest: NotificationPage): NotificationPage {
  const oldestNewest = newest.items.at(-1)?.createdAt;
  const newestIds = new Set(newest.items.map((item) => item.id));
  const older = oldestNewest
    ? current.items.filter((item) => !newestIds.has(item.id) && item.createdAt < oldestNewest)
    : [];
  return {
    items: [...newest.items, ...older],
    nextBefore: older.length > 0 ? current.nextBefore : newest.nextBefore,
  };
}

export function appendOlderPage(current: NotificationPage, older: NotificationPage): NotificationPage {
  const known = new Set(current.items.map((item) => item.id));
  return {
    items: [...current.items, ...older.items.filter((item) => !known.has(item.id))],
    nextBefore: older.nextBefore,
  };
}

export function markItemsRead(items: readonly NotificationDto[], ids: ReadonlySet<string> | "all") {
  return items.map((item) => (!item.read && (ids === "all" || ids.has(item.id)) ? { ...item, read: true } : item));
}
