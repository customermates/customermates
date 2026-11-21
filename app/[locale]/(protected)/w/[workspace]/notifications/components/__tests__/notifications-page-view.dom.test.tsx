import type { ReactNode } from "react";
import type { Root } from "react-dom/client";

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { NotificationDto, NotificationInbox } from "@/features/notifications/notification.schema";

const harness = vi.hoisted(() => ({
  getNotificationsAction: vi.fn(),
  markNotificationsReadAction: vi.fn(),
  rootStore: null as unknown,
  topBar: null as unknown,
}));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/core/stores/root-store.provider", () => ({ useRootStore: () => harness.rootStore }));
vi.mock("@/core/stores/use-hydrated-intl-store", () => ({
  useHydratedIntlStore: () => ({
    rendersZonedValues: true,
    formatRelativeTime: () => "just now",
    formatDescriptiveShortDate: () => "earlier day",
  }),
}));
vi.mock("@/i18n/navigation", () => ({
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
vi.mock("@/app/components/topbar-actions-context", () => ({
  useSetTopBarActions: (node: unknown) => {
    harness.topBar = node;
  },
}));
vi.mock("@/core/utils/background-poll", () => ({ startBackgroundPoll: () => () => undefined }));
vi.mock("@/core/errors/report-application-error", () => ({
  reportApplicationError: vi.fn(),
  runUserAction: (operation: () => unknown) => void operation(),
}));
vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: () => null,
}));
vi.mock("@/app/components/notifications/notification-actions", () => ({
  getNotificationsAction: harness.getNotificationsAction,
  markNotificationsReadAction: harness.markNotificationsReadAction,
}));
vi.mock("@/core/utils/toast-zod-error-tree", () => ({ toastZodErrorTree: vi.fn() }));

import { NotificationsPageView } from "../notifications-page-view";
import { NotificationsStore } from "../notifications.store";

const NOW = new Date("2026-11-16T12:00:00");
const DAY_MS = 24 * 60 * 60 * 1000;

function notification(id: string, createdAt: Date, overrides: Partial<NotificationDto> = {}): NotificationDto {
  return {
    id: `00000000-0000-4000-8000-00000000000${id}`,
    kind: "dueToday",
    title: `Title ${id}`,
    body: null,
    href: null,
    read: false,
    createdAt: createdAt.toISOString(),
    ...overrides,
  };
}

const TODAY_UNREAD = notification("1", new Date(NOW.getTime() - 60 * 60 * 1000), {
  body: "Body one",
  href: "/records/deals",
  kind: "replyReceived",
});
const TODAY_READ = notification("2", new Date(NOW.getTime() - 2 * 60 * 60 * 1000), { read: true });
const YESTERDAY_UNREAD = notification("3", new Date(NOW.getTime() - DAY_MS), { kind: "ruleAlert" });
const EARLIER_UNREAD = notification("4", new Date(NOW.getTime() - 10 * DAY_MS));

function inbox(overrides: Partial<NotificationInbox> = {}): NotificationInbox {
  return {
    items: [TODAY_UNREAD, TODAY_READ, YESTERDAY_UNREAD],
    unreadCount: 2,
    nextBefore: null,
    ...overrides,
  };
}

let container: HTMLDivElement;
let barContainer: HTMLDivElement;
let root: Root;
let barRoot: Root;

function render(initialInbox: NotificationInbox) {
  harness.rootStore = { notificationsStore: new NotificationsStore() };
  act(() => root.render(<NotificationsPageView initialInbox={initialInbox} />));
  act(() => barRoot.render(<>{harness.topBar as ReactNode}</>));
}

function rows() {
  return [...container.querySelectorAll<HTMLElement>("[data-notification-row]")];
}

function opener(row: HTMLElement) {
  return row.querySelector<HTMLElement>("[data-notification-open]");
}

function markReadButton(row: HTMLElement) {
  return row.querySelector<HTMLButtonElement>("button[aria-label='Notifications.markRead']");
}

function headings() {
  return [...container.querySelectorAll("h2")].map((heading) => heading.textContent);
}

function segment(label: string) {
  return [...container.querySelectorAll<HTMLButtonElement>("[role='tab']")].find((tab) => tab.textContent === label);
}

async function choose(label: string) {
  const tab = segment(label);
  await act(async () => {
    tab?.focus();
    tab?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
    await Promise.resolve();
  });
}

function unreadDots() {
  return container.querySelectorAll("[role='img']");
}

function button(label: string) {
  return [...container.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent === label);
}

async function click(element: HTMLElement | null | undefined) {
  await act(async () => {
    element?.click();
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  barContainer = document.createElement("div");
  document.body.append(container, barContainer);
  root = createRoot(container);
  barRoot = createRoot(barContainer);
  harness.getNotificationsAction.mockReset();
  harness.markNotificationsReadAction.mockReset();
});

afterEach(() => {
  act(() => {
    root.unmount();
    barRoot.unmount();
  });
  container.remove();
  barContainer.remove();
  vi.useRealTimers();
});

describe("NotificationsPageView", () => {
  it("groups the rows into Today and This week with a kind tile, title, body, relative time and an unread dot", () => {
    render(inbox());

    expect(headings()).toEqual(["Notifications.groups.today", "Notifications.groups.thisWeek"]);
    expect(container.querySelectorAll("section")).toHaveLength(2);
    expect(rows()).toHaveLength(3);
    expect(rows()[0].textContent).toContain("Title 1");
    expect(rows()[0].textContent).toContain("Body one");
    expect(rows()[0].textContent).not.toContain("Notifications.kinds.replyReceived");
    expect(rows()[0].textContent).toContain("just now");
    expect(opener(rows()[0])?.getAttribute("href")).toBe("/records/deals");
    expect(rows()[0].querySelector(".bg-info\\/12")).not.toBeNull();
    expect(unreadDots()).toHaveLength(2);
    expect(rows()[1].querySelector("[role='img']")).toBeNull();
  });

  it("puts anything older than a week under Earlier", () => {
    render(inbox({ items: [TODAY_READ, EARLIER_UNREAD] }));

    expect(headings()).toEqual(["Notifications.groups.today", "Notifications.groups.earlier"]);
  });

  it("marks an unread notification read when its row is opened", async () => {
    harness.markNotificationsReadAction.mockResolvedValue({ ok: true, data: { marked: 1 } });
    render(inbox());

    await click(opener(rows()[0]));

    expect(harness.markNotificationsReadAction).toHaveBeenCalledWith({ ids: [TODAY_UNREAD.id] });
    expect(unreadDots()).toHaveLength(1);
  });

  it("marks a notification without a link read from its row button", async () => {
    harness.markNotificationsReadAction.mockResolvedValue({ ok: true, data: { marked: 1 } });
    render(inbox());

    await click(opener(rows()[2]));

    expect(opener(rows()[2])?.tagName).toBe("BUTTON");
    expect(harness.markNotificationsReadAction).toHaveBeenCalledWith({ ids: [YESTERDAY_UNREAD.id] });
  });

  it("marks a row read from its inline button without opening it", async () => {
    harness.markNotificationsReadAction.mockResolvedValue({ ok: true, data: { marked: 1 } });
    render(inbox());
    expect(markReadButton(rows()[1])).toBeNull();

    await click(markReadButton(rows()[0]));

    expect(harness.markNotificationsReadAction).toHaveBeenCalledWith({ ids: [TODAY_UNREAD.id] });
    expect(rows()[0].hasAttribute("data-unread")).toBe(false);
    expect(markReadButton(rows()[0])).toBeNull();
  });

  it("does not call the server for a notification that is already read", async () => {
    render(inbox());

    await click(opener(rows()[1]));

    expect(harness.markNotificationsReadAction).not.toHaveBeenCalled();
  });

  it("marks everything read from the header action and disables it afterwards", async () => {
    harness.markNotificationsReadAction.mockResolvedValue({ ok: true, data: { marked: 2 } });
    render(inbox());
    const markAll = () => barContainer.querySelector<HTMLButtonElement>("#notifications-mark-all-read");
    expect(markAll()?.disabled).toBe(false);

    await click(markAll());
    act(() => barRoot.render(<>{harness.topBar as ReactNode}</>));

    expect(harness.markNotificationsReadAction).toHaveBeenCalledWith({ all: true });
    expect(unreadDots()).toHaveLength(0);
    expect(markAll()?.disabled).toBe(true);
  });

  it("links the settings action to the notification preferences", () => {
    render(inbox());

    expect(barContainer.querySelector("#notifications-settings")?.getAttribute("href")).toBe(
      "/settings/profile#notification-preferences",
    );
  });

  it("pages with Load more until the last page", async () => {
    harness.getNotificationsAction.mockResolvedValue({
      ok: true,
      data: inbox({ items: [EARLIER_UNREAD], unreadCount: 3, nextBefore: null }),
    });
    render(inbox({ nextBefore: YESTERDAY_UNREAD.createdAt }));
    expect(button("Common.actions.loadMore")).toBeDefined();

    await click(button("Common.actions.loadMore"));

    expect(harness.getNotificationsAction).toHaveBeenCalledWith({ limit: 25, before: YESTERDAY_UNREAD.createdAt });
    expect(rows()).toHaveLength(4);
    expect(container.querySelectorAll("h2")).toHaveLength(3);
    expect(button("Common.actions.loadMore")).toBeUndefined();
  });

  it("filters by unread and by kind in one segmented control and explains an empty filter", async () => {
    render(inbox({ nextBefore: null }));
    expect(segment("Notifications.pageFilters.all")?.dataset.state).toBe("active");

    await choose("Notifications.pageFilters.ruleAlert");
    expect(rows().map((row) => row.textContent)).toEqual([expect.stringContaining("Title 3")]);

    await choose("Notifications.pageFilters.unread");
    expect(rows()).toHaveLength(2);

    await choose("Notifications.pageFilters.dueToday");
    expect(rows()).toHaveLength(1);

    await choose("Notifications.pageFilters.all");
    expect(rows()).toHaveLength(3);
  });

  it("shows the empty state when there is nothing to list", () => {
    render(inbox({ items: [], unreadCount: 0, nextBefore: null }));

    expect(container.querySelector("[data-page-state='empty']")?.textContent).toContain("Notifications.empty");
    expect(rows()).toHaveLength(0);
  });
});
