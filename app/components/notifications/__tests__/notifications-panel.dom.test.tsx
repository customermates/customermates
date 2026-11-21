import type { ReactNode } from "react";
import type { Root } from "react-dom/client";

import { runInAction } from "mobx";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { NotificationDto, NotificationInbox } from "@/features/notifications/notification.schema";

const harness = vi.hoisted(() => ({
  getNotificationsAction: vi.fn(),
  markNotificationsReadAction: vi.fn(),
  push: vi.fn(),
}));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/core/stores/use-hydrated-intl-store", () => ({
  useHydratedIntlStore: () => ({ rendersZonedValues: true, formatRelativeTime: () => "just now" }),
}));
vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: () => null,
}));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: harness.push }),
  IntlLink: ({
    children,
    href,
    onClick,
    ...props
  }: {
    children?: ReactNode;
    href: string;
    onClick?: (event: unknown) => void;
  }) => (
    <a
      {...props}
      href={href}
      onClick={(event) => {
        onClick?.(event);
        event.preventDefault();
      }}
    >
      {children}
    </a>
  ),
}));
vi.mock("@/core/utils/background-poll", () => ({
  startBackgroundPoll: ({ refresh }: { refresh: () => Promise<unknown> }) => {
    void refresh();
    return () => undefined;
  },
}));
vi.mock("@/core/errors/report-application-error", () => ({
  reportApplicationError: vi.fn(),
  runUserAction: (operation: () => unknown) => void operation(),
}));
vi.mock("@/app/components/notifications/notification-actions", () => ({
  getNotificationsAction: harness.getNotificationsAction,
  markNotificationsReadAction: harness.markNotificationsReadAction,
}));
vi.mock("@/core/utils/toast-zod-error-tree", () => ({ toastZodErrorTree: vi.fn() }));

import { NotificationsStore } from "@/app/[locale]/(protected)/w/[workspace]/notifications/components/notifications.store";

import { NotificationsPanel } from "../notifications-panel";

const NOW = new Date("2026-11-16T12:00:00Z");

function notification(index: number, overrides: Partial<NotificationDto> = {}): NotificationDto {
  return {
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    kind: "ruleAlert",
    title: `Title ${index}`,
    body: null,
    href: null,
    read: false,
    createdAt: new Date(NOW.getTime() - index * 60_000).toISOString(),
    ...overrides,
  };
}

function inbox(items: NotificationDto[]): NotificationInbox {
  return { items, unreadCount: items.filter((item) => !item.read).length, nextBefore: null };
}

let container: HTMLDivElement;
let root: Root;
let store: NotificationsStore;
const onNavigate = vi.fn();

async function render(page: NotificationInbox, unreadCount = page.unreadCount) {
  harness.getNotificationsAction.mockResolvedValue({ ok: true, data: page });
  store = new NotificationsStore();
  runInAction(() => (store.unreadCount = unreadCount));
  await act(async () => {
    root.render(<NotificationsPanel settingsHref="/settings/profile#prefs" store={store} onNavigate={onNavigate} />);
    await Promise.resolve();
  });
}

function rows() {
  return [...container.querySelectorAll<HTMLElement>("[data-notification-row]")];
}

function tab(label: string) {
  return [...container.querySelectorAll<HTMLButtonElement>("[role='tab']")].find((item) =>
    item.textContent?.startsWith(label),
  );
}

async function choose(label: string) {
  const target = tab(label);
  await act(async () => {
    target?.focus();
    target?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
    await Promise.resolve();
  });
}

async function click(element: HTMLElement | null | undefined) {
  await act(async () => {
    element?.click();
    await Promise.resolve();
  });
}

function labelled(label: string) {
  return container.querySelector<HTMLButtonElement>(`button[aria-label='${label}']`);
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  harness.getNotificationsAction.mockReset();
  harness.markNotificationsReadAction.mockReset();
  harness.push.mockReset();
  onNavigate.mockReset();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("NotificationsPanel", () => {
  it("shows a skeleton until the newest notifications arrive", async () => {
    harness.getNotificationsAction.mockReturnValue(new Promise(() => undefined));
    store = new NotificationsStore();
    await act(async () => {
      root.render(<NotificationsPanel settingsHref="/settings" store={store} onNavigate={onNavigate} />);
      await Promise.resolve();
    });

    expect(container.querySelector("[data-skeleton-shape]")).not.toBeNull();
    expect(harness.getNotificationsAction).toHaveBeenCalledWith({ limit: 25 });
  });

  it("opens on Unread with its count and lists only unread notifications", async () => {
    await render(inbox([notification(1), notification(2, { read: true }), notification(3)]));

    expect(tab("Notifications.pageFilters.unread")?.dataset.state).toBe("active");
    expect(tab("Notifications.pageFilters.unread")?.textContent).toBe("Notifications.pageFilters.unread2");
    expect(rows().map((row) => row.textContent)).toEqual([
      expect.stringContaining("Title 1"),
      expect.stringContaining("Title 3"),
    ]);
  });

  it("shows the newest eight of all notifications on All", async () => {
    await render(inbox(Array.from({ length: 12 }, (_, index) => notification(index + 1, { read: index > 0 }))));

    await choose("Notifications.pageFilters.all");

    expect(rows()).toHaveLength(8);
    expect(rows()[0].textContent).toContain("Title 1");
    expect(rows()[7].textContent).toContain("Title 8");
  });

  it("opens on All when nothing is unread", async () => {
    await render(inbox([notification(1, { read: true })]));

    expect(tab("Notifications.pageFilters.all")?.dataset.state).toBe("active");
    expect(rows()).toHaveLength(1);
  });

  it("marks one row read from its inline button and drops it from Unread", async () => {
    harness.markNotificationsReadAction.mockResolvedValue({ ok: true, data: { marked: 1 } });
    await render(inbox([notification(1), notification(2)]));

    await click(rows()[0].querySelector<HTMLButtonElement>("button[aria-label='Notifications.markRead']"));

    expect(harness.markNotificationsReadAction).toHaveBeenCalledWith({ ids: [notification(1).id] });
    expect(rows().map((row) => row.textContent)).toEqual([expect.stringContaining("Title 2")]);
    expect(store.unreadCount).toBe(1);
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("marks everything read and then explains that nothing is unread", async () => {
    harness.markNotificationsReadAction.mockResolvedValue({ ok: true, data: { marked: 2 } });
    await render(inbox([notification(1), notification(2)]));
    expect(labelled("Notifications.markAllRead")?.disabled).toBe(false);

    await click(labelled("Notifications.markAllRead"));

    expect(harness.markNotificationsReadAction).toHaveBeenCalledWith({ all: true });
    expect(container.querySelector("[data-notifications-panel-empty]")?.textContent).toBe("Notifications.emptyUnread");
    expect(labelled("Notifications.markAllRead")?.disabled).toBe(true);
  });

  it("closes when a row is opened, when See all is followed and when settings are opened", async () => {
    await render(inbox([notification(1, { read: true, href: "/records/deals" })]));

    await click(container.querySelector<HTMLElement>("a[data-notification-open]"));
    expect(onNavigate).toHaveBeenCalledTimes(1);

    const seeAll = container.querySelector<HTMLAnchorElement>("#notifications-panel-see-all");
    expect(seeAll?.getAttribute("href")).toBe("/notifications");
    await click(seeAll);
    expect(onNavigate).toHaveBeenCalledTimes(2);

    await click(labelled("Notifications.settings"));
    expect(onNavigate).toHaveBeenCalledTimes(3);
    expect(harness.push).toHaveBeenCalledWith("/settings/profile#prefs");
  });
});
