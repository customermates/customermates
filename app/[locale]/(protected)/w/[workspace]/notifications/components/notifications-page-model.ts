import type { NotificationDto } from "@/features/notifications/notification.schema";

import { NOTIFICATION_KINDS } from "@/features/notifications/notification.schema";

export const NOTIFICATIONS_PAGE_SIZE = 25;

export type NotificationPageFilter = "all" | "unread" | (typeof NOTIFICATION_KINDS)[number];

export const NOTIFICATION_PAGE_FILTERS = [
  "all",
  "unread",
  ...NOTIFICATION_KINDS,
] as const satisfies readonly NotificationPageFilter[];

export const NOTIFICATION_AGE_GROUPS = ["today", "thisWeek", "earlier"] as const;

export type NotificationAgeGroup = (typeof NOTIFICATION_AGE_GROUPS)[number];

export type NotificationAgeSection = { group: NotificationAgeGroup; items: NotificationDto[] };

export const NOTIFICATION_PANEL_LIMIT = 8;

export type NotificationPanelFilter = "unread" | "all";

const WEEK_DAYS = 7;

export function filterNotificationsForPage(items: readonly NotificationDto[], filter: NotificationPageFilter) {
  if (filter === "all") return [...items];
  if (filter === "unread") return items.filter((item) => !item.read);
  return items.filter((item) => item.kind === filter);
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function notificationAgeGroup(date: Date, now: Date): NotificationAgeGroup {
  const today = startOfDay(now);
  if (date >= today) return "today";
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - (WEEK_DAYS - 1));
  return date >= weekStart ? "thisWeek" : "earlier";
}

export function groupNotificationsByAge(items: readonly NotificationDto[], now: Date): NotificationAgeSection[] {
  const sections = new Map<NotificationAgeGroup, NotificationDto[]>();
  for (const item of items) {
    const group = notificationAgeGroup(new Date(item.createdAt), now);
    sections.set(group, [...(sections.get(group) ?? []), item]);
  }
  return NOTIFICATION_AGE_GROUPS.flatMap((group) => {
    const groupItems = sections.get(group);
    return groupItems ? [{ group, items: groupItems }] : [];
  });
}

export function panelNotifications(items: readonly NotificationDto[], filter: NotificationPanelFilter) {
  return (filter === "unread" ? items.filter((item) => !item.read) : items).slice(0, NOTIFICATION_PANEL_LIMIT);
}

export type NotificationPage = { items: NotificationDto[]; nextBefore: string | null };

function sortsAfter(item: NotificationDto, other: NotificationDto) {
  return item.createdAt < other.createdAt || (item.createdAt === other.createdAt && item.id > other.id);
}

export function mergeNewestPage(current: NotificationPage, newest: NotificationPage): NotificationPage {
  const oldestNewest = newest.items.at(-1);
  const older = oldestNewest ? current.items.filter((item) => sortsAfter(item, oldestNewest)) : [];
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
