import type { ReactNode } from "react";
import type { Root } from "react-dom/client";

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { NotificationDto } from "@/features/notifications/notification.schema";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: () => null,
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

import { NotificationRow } from "../notification-row";

function notification(overrides: Partial<NotificationDto> = {}): NotificationDto {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    kind: "dueToday",
    title: "Renewal closes in three weeks",
    body: "Check the next step",
    href: null,
    read: false,
    createdAt: "2026-11-16T10:00:00.000Z",
    ...overrides,
  };
}

let container: HTMLDivElement;
let root: Root;
const onMarkRead = vi.fn();
const onOpen = vi.fn();

function render(item: NotificationDto) {
  act(() => root.render(<NotificationRow item={item} time="2 days ago" onMarkRead={onMarkRead} onOpen={onOpen} />));
}

function markReadButton() {
  return container.querySelector<HTMLButtonElement>("button[aria-label='Notifications.markRead']");
}

function tile() {
  return container.querySelector<HTMLElement>("[data-notification-open] > span[aria-hidden='true'].rounded-lg");
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  onMarkRead.mockReset();
  onOpen.mockReset();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("NotificationRow", () => {
  it("shows a bold title, a one-line body, the time and an unread dot without the kind label", () => {
    render(notification());

    const title = [...container.querySelectorAll("span")].find(
      (span) => span.textContent === "Renewal closes in three weeks",
    );
    expect(title?.className).toContain("font-semibold");
    expect(container.textContent).toContain("Check the next step");
    expect(container.textContent).toContain("2 days ago");
    expect(container.textContent).not.toContain("Notifications.kinds");
    expect(container.querySelector("[role='img'][aria-label='Notifications.unread']")).not.toBeNull();
  });

  it("marks the row read from the inline button without opening it", () => {
    render(notification());

    act(() => markReadButton()?.click());

    expect(onMarkRead).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000001");
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("marks the row read and reports the open when the row is opened", () => {
    render(notification({ href: "/records/deals" }));

    act(() => container.querySelector<HTMLElement>("a[data-notification-open]")?.click());

    expect(onMarkRead).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("offers no mark-read button and no dot once the row is read", () => {
    render(notification({ read: true }));

    expect(markReadButton()).toBeNull();
    expect(container.querySelector("[role='img']")).toBeNull();
    act(() => container.querySelector<HTMLElement>("[data-notification-open]")?.click());
    expect(onMarkRead).not.toHaveBeenCalled();
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("tints the tile per kind and uses a calendar tile for booking alerts", () => {
    render(notification({ kind: "dueToday" }));
    expect(tile()?.className).toContain("bg-warning/12");

    render(notification({ kind: "replyReceived" }));
    expect(tile()?.className).toContain("bg-info/12");

    render(notification({ kind: "ruleAlert", href: "/automations" }));
    expect(tile()?.className).toContain("bg-primary/10");
    const automationIcon = tile()?.innerHTML;

    render(notification({ kind: "ruleAlert", href: "/calendar?panel=booking" }));
    expect(tile()?.className).toContain("bg-primary/10");
    expect(tile()?.innerHTML).not.toBe(automationIcon);
  });
});
