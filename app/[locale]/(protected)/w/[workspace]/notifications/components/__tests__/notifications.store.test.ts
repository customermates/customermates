import { beforeEach, describe, expect, it, vi } from "vitest";

import type { NotificationDto, NotificationInbox } from "@/features/notifications/notification.schema";

const harness = vi.hoisted(() => ({
  getNotificationsAction: vi.fn(),
  markNotificationsReadAction: vi.fn(),
  toastZodErrorTree: vi.fn(),
}));

vi.mock("@/app/components/notifications/notification-actions", () => ({
  getNotificationsAction: harness.getNotificationsAction,
  markNotificationsReadAction: harness.markNotificationsReadAction,
}));
vi.mock("@/core/utils/toast-zod-error-tree", () => ({ toastZodErrorTree: harness.toastZodErrorTree }));

import { NOTIFICATIONS_PAGE_SIZE } from "../notifications-page-model";
import { NotificationsStore } from "../notifications.store";

function notification(id: string, createdAt: string, overrides: Partial<NotificationDto> = {}): NotificationDto {
  return {
    id,
    kind: "dueToday",
    title: `Title ${id}`,
    body: null,
    href: null,
    read: false,
    createdAt: new Date(createdAt).toISOString(),
    ...overrides,
  };
}

const NEWEST = notification("00000000-0000-4000-8000-000000000001", "2026-11-16T12:00:00");
const MIDDLE = notification("00000000-0000-4000-8000-000000000002", "2026-11-16T11:00:00", { read: true });
const OLDEST = notification("00000000-0000-4000-8000-000000000003", "2026-11-15T10:00:00");

function inbox(overrides: Partial<NotificationInbox> = {}): NotificationInbox {
  return { items: [NEWEST, MIDDLE], unreadCount: 1, nextBefore: MIDDLE.createdAt, ...overrides };
}

function hydrated(overrides: Partial<NotificationInbox> = {}) {
  const store = new NotificationsStore();
  store.hydrate(inbox(overrides));
  return store;
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("NotificationsStore", () => {
  it("shows the server page and its unread count", () => {
    const store = hydrated();

    expect(store.items).toEqual([NEWEST, MIDDLE]);
    expect(store.unreadCount).toBe(1);
    expect(store.nextBefore).toBe(MIDDLE.createdAt);
  });

  it("loads the next page from the cursor and appends it", async () => {
    const store = hydrated();
    harness.getNotificationsAction.mockResolvedValue({
      ok: true,
      data: inbox({ items: [OLDEST], unreadCount: 2, nextBefore: null }),
    });

    await store.loadMore();

    expect(harness.getNotificationsAction).toHaveBeenCalledWith({
      limit: NOTIFICATIONS_PAGE_SIZE,
      before: MIDDLE.createdAt,
    });
    expect(store.items.map((item) => item.id)).toEqual([NEWEST.id, MIDDLE.id, OLDEST.id]);
    expect(store.nextBefore).toBeNull();
    expect(store.unreadCount).toBe(2);
    expect(store.isLoadingMore).toBe(false);
  });

  it("does not page without a cursor or while a page is loading", async () => {
    const last = hydrated({ nextBefore: null });
    await last.loadMore();
    expect(harness.getNotificationsAction).not.toHaveBeenCalled();

    const store = hydrated();
    let release: (value: unknown) => void = () => undefined;
    harness.getNotificationsAction.mockReturnValue(new Promise((resolve) => (release = resolve)));
    const pending = store.loadMore();
    await store.loadMore();
    expect(harness.getNotificationsAction).toHaveBeenCalledTimes(1);
    expect(store.isLoadingMore).toBe(true);
    release({ ok: true, data: inbox({ items: [OLDEST], nextBefore: null }) });
    await pending;
    expect(store.isLoadingMore).toBe(false);
  });

  it("marks the unread notifications read and lowers the unread count by what the server marked", async () => {
    const store = hydrated();
    harness.markNotificationsReadAction.mockResolvedValue({ ok: true, data: { marked: 1 } });

    await store.markRead([NEWEST.id, MIDDLE.id]);

    expect(harness.markNotificationsReadAction).toHaveBeenCalledWith({ ids: [NEWEST.id] });
    expect(store.items.map((item) => item.read)).toEqual([true, true]);
    expect(store.unreadCount).toBe(0);
  });

  it("does not call the server for notifications that are already read", async () => {
    const store = hydrated();

    await store.markRead([MIDDLE.id]);

    expect(harness.markNotificationsReadAction).not.toHaveBeenCalled();
  });

  it("marks everything read, also the pages that are not loaded", async () => {
    const store = hydrated({ unreadCount: 5 });
    harness.markNotificationsReadAction.mockResolvedValue({ ok: true, data: { marked: 5 } });

    await store.markAllRead();

    expect(harness.markNotificationsReadAction).toHaveBeenCalledWith({ all: true });
    expect(store.items.every((item) => item.read)).toBe(true);
    expect(store.unreadCount).toBe(0);
    expect(store.isMarking).toBe(false);
  });

  it("keeps the notifications unread and tells the user when marking fails", async () => {
    const store = hydrated();
    const error = { errors: ["failed"] };
    harness.markNotificationsReadAction.mockResolvedValue({ ok: false, error });

    await store.markRead([NEWEST.id]);

    expect(harness.toastZodErrorTree).toHaveBeenCalledWith(error);
    expect(store.items[0].read).toBe(false);
    expect(store.unreadCount).toBe(1);
    expect(store.isMarking).toBe(false);
  });

  it("reads only the unread count for the sidebar badge", async () => {
    const store = new NotificationsStore();
    harness.getNotificationsAction.mockResolvedValue({ ok: true, data: inbox({ unreadCount: 7 }) });

    await store.refreshUnreadCount();

    expect(harness.getNotificationsAction).toHaveBeenCalledWith({ limit: 1 });
    expect(store.unreadCount).toBe(7);
    expect(store.items).toEqual([]);
    expect(store.hasLoaded).toBe(false);
  });

  it("counts as loaded once the bell panel fetched the newest page", async () => {
    const store = new NotificationsStore();
    harness.getNotificationsAction.mockResolvedValue({ ok: true, data: inbox({ items: [NEWEST] }) });
    expect(store.hasLoaded).toBe(false);

    await store.refreshNewest();

    expect(store.hasLoaded).toBe(true);
    expect(store.items).toEqual([NEWEST]);
  });

  it("puts new notifications in front on a background refresh and keeps what was loaded", async () => {
    const store = hydrated({ items: [NEWEST, MIDDLE, OLDEST], nextBefore: null, unreadCount: 2 });
    const fresh = notification("00000000-0000-4000-8000-000000000009", "2026-11-16T13:00:00");
    harness.getNotificationsAction.mockResolvedValue({
      ok: true,
      data: inbox({ items: [fresh, NEWEST], unreadCount: 3, nextBefore: NEWEST.createdAt }),
    });

    await store.refreshNewest();

    expect(harness.getNotificationsAction).toHaveBeenCalledWith({ limit: NOTIFICATIONS_PAGE_SIZE });
    expect(store.items.map((item) => item.id)).toEqual([fresh.id, NEWEST.id, MIDDLE.id, OLDEST.id]);
    expect(store.unreadCount).toBe(3);
    expect(store.nextBefore).toBeNull();
  });

  it("drops a background refresh that a mark-read overtook", async () => {
    const store = hydrated();
    let release: (value: unknown) => void = () => undefined;
    harness.getNotificationsAction.mockReturnValue(new Promise((resolve) => (release = resolve)));
    harness.markNotificationsReadAction.mockResolvedValue({ ok: true, data: { marked: 1 } });

    const refresh = store.refreshNewest();
    await store.markRead([NEWEST.id]);
    release({ ok: true, data: inbox() });
    await refresh;

    expect(store.items[0].read).toBe(true);
    expect(store.unreadCount).toBe(0);
  });

  it("drops an older page that a mark-read overtook and leaves the cursor for another try", async () => {
    const store = hydrated();
    let release: (value: unknown) => void = () => undefined;
    harness.getNotificationsAction.mockReturnValue(new Promise((resolve) => (release = resolve)));
    harness.markNotificationsReadAction.mockResolvedValue({ ok: true, data: { marked: 1 } });

    const page = store.loadMore();
    await store.markRead([NEWEST.id]);
    release({ ok: true, data: inbox({ items: [OLDEST], unreadCount: 2, nextBefore: null }) });
    await page;

    expect(store.items.map((item) => item.id)).toEqual([NEWEST.id, MIDDLE.id]);
    expect(store.items[0].read).toBe(true);
    expect(store.unreadCount).toBe(0);
    expect(store.nextBefore).toBe(MIDDLE.createdAt);
    expect(store.isLoadingMore).toBe(false);
  });
});
