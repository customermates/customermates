import type { ReactNode } from "react";
import type { Root } from "react-dom/client";
import type { UpcomingBookingDto } from "@/ee/calendar/booking.schema";
import type { BookingPanelState } from "../booking/booking-panel-model";

import { act, createElement, Fragment } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  modal: { start: vi.fn(), configure: vi.fn() },
  refresh: vi.fn(),
  save: vi.fn(),
  remove: vi.fn(),
  cancelBooking: vi.fn(),
  toastError: vi.fn(),
  copy: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
  useLocale: () => "en",
}));
vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => ({ bookingLinkModalStore: harness.modal }),
}));
vi.mock("@/core/stores/use-hydrated-intl-store", () => ({
  useHydratedIntlStore: () => ({
    formatTime: (date: Date | undefined) => (date ? date.toISOString().slice(11, 16) : ""),
    formatDayMonth: (date: Date | undefined) => (date ? `day ${date.toISOString().slice(5, 10)}` : ""),
  }),
}));
vi.mock("@/i18n/navigation", () => ({
  IntlLink: ({ children, href }: { children: unknown; href: string }) =>
    createElement("a", { href, "data-intl-link": "" }, children as never),
  useRouter: () => ({ refresh: harness.refresh }),
}));
vi.mock("../../booking-actions", () => ({
  saveBookingLinkAction: harness.save,
  deleteBookingLinkAction: harness.remove,
  cancelHostedBookingAction: harness.cancelBooking,
  rescheduleHostedBookingAction: vi.fn(),
  readHostedBookingSlotsAction: vi.fn(),
}));
vi.mock("@/core/errors/report-application-error", () => ({
  runUserAction: (action: () => unknown) => void action(),
  reportApplicationError: vi.fn(),
}));
vi.mock("@/core/utils/toast-zod-error-tree", () => ({ toastZodErrorTree: harness.toastError }));
vi.mock("@/core/utils/use-copy-to-clipboard", () => ({ useCopyToClipboard: () => harness.copy }));
vi.mock("@/components/modal/hooks/use-delete-confirmation", () => ({
  useDeleteConfirmation: () => ({
    showDeleteConfirmation: (confirm: () => Promise<boolean>) => {
      void confirm();
    },
  }),
}));
vi.mock("@/components/channels/connect-channel-menu", () => ({
  ConnectChannelButton: () => createElement("button", { id: "connect-calendar" }),
}));
vi.mock("@/components/page-state/page-state", () => ({
  PageState: ({ title, action }: { title: string; action: unknown }) =>
    createElement("div", { "data-page-state": "" }, title, action as never),
}));
vi.mock("@/components/ui/item-actions", () => ({
  ItemActions: ({ children, menu, label }: { children: ReactNode; menu?: ReactNode; label?: string }) =>
    createElement(Fragment, null, children, menu ? createElement("div", { "data-test-menu": label }, menu) : null),
  ItemActionsTrigger: ({ menu, label, disabled }: { menu?: ReactNode; label?: string; disabled?: boolean }) =>
    createElement(
      "div",
      { "data-test-trigger": label ?? "", "data-disabled": disabled ? "true" : "false" },
      menu ?? null,
    ),
}));
vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenuItem: ({
    children,
    onSelect,
    asChild,
    variant,
    ...rest
  }: {
    children: ReactNode;
    onSelect?: (event: Event) => void;
    asChild?: boolean;
    variant?: string;
  }) =>
    asChild
      ? children
      : createElement(
          "button",
          { ...rest, type: "button", "data-variant": variant, onClick: () => onSelect?.(new Event("select")) },
          children,
        ),
  DropdownMenuSeparator: () => createElement("hr"),
}));

import { BookingPanel } from "../booking/booking-panel";

import { bookingLink, READY_SETUP } from "./booking-fixtures";

const MINE = bookingLink({ upcomingBookings: 3, withVideo: true });
const ADA = bookingLink({
  id: "20000000-0000-4000-8000-000000000002",
  token: "tok_adaadaadaadaadaada",
  url: "https://app.example.com/book/tok_adaadaadaadaadaada",
  title: "Support",
  ownerName: "Ada Lovelace",
  own: false,
  enabled: false,
});

let host: HTMLDivElement;
let container: HTMLElement;
let root: Root;
const onClose = vi.fn();

async function renderPanel(state: BookingPanelState) {
  await act(async () => {
    root.render(createElement(BookingPanel, { state, onClose }));
    await Promise.resolve();
  });
}

const ready = (links = [MINE, ADA], setup = READY_SETUP): BookingPanelState => ({ status: "ready", links, setup });

function row(id: string): HTMLElement {
  const found = container.querySelector<HTMLElement>(`[data-booking-link="${id}"]`);
  if (!found) throw new Error(`Row ${id} did not render.`);
  return found;
}

function menuOf(title: string): HTMLElement {
  const found = container.querySelector<HTMLElement>(
    `[data-test-menu='Booking.pageActions:${JSON.stringify({ title })}']`,
  );
  if (!found) throw new Error(`Menu of ${title} did not render.`);
  return found;
}

function buttonWithText(scope: HTMLElement, text: string): HTMLButtonElement {
  const found = [...scope.querySelectorAll("button")].find((button) => button.textContent?.includes(text));
  if (!found) throw new Error(`Button ${text} did not render.`);
  return found;
}

function newPageButton(): HTMLButtonElement {
  const actions = container.querySelector<HTMLElement>('[data-slot="app-modal-actions"]');
  if (!actions) throw new Error("The sheet has no header actions.");
  return buttonWithText(actions, "Booking.newShort");
}

function hasButton(scope: HTMLElement, text: string): boolean {
  return [...scope.querySelectorAll("button")].some((button) => button.textContent?.includes(text));
}

function upcomingBooking(id: string, linkId: string, startsAt: string, inviteeName: string): UpcomingBookingDto {
  return {
    id,
    bookingLinkId: linkId,
    pageTitle: "Intro call",
    inviteeName,
    inviteeEmail: "visitor@example.com",
    startsAt,
    endsAt: new Date(Date.parse(startsAt) + 30 * 60_000).toISOString(),
    hostUserId: "40000000-0000-4000-8000-000000000001",
    hostName: "Ana Host",
    calendarEventId: null,
    recordTypeId: null,
    recordId: null,
  };
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  harness.save.mockResolvedValue({ ok: true, data: {} });
  harness.remove.mockResolvedValue({ ok: true, data: {} });
  harness.copy.mockResolvedValue(true);
  vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
  host = document.createElement("div");
  document.body.append(host);
  container = document.body;
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("BookingPanel", () => {
  it("shows a full-height sheet header with the title, a new page button and a close button", async () => {
    await renderPanel(ready());

    const panel = container.querySelector<HTMLElement>("[data-booking-panel]");
    const sheet = panel?.closest<HTMLElement>('[role="dialog"]');
    expect(sheet?.querySelector('[data-slot="sheet-title"]')?.textContent).toBe("Booking.panelTitle");
    expect(sheet?.querySelector('[data-slot="sheet-close"]')).not.toBeNull();
    expect(sheet?.contains(newPageButton())).toBe(true);
    expect(newPageButton().disabled).toBe(false);
  });

  it("draws one row per page with its length, place, hosts, short link and status, grouped by owner", async () => {
    await renderPanel(ready());

    const own = row(MINE.id);
    expect(own.querySelector("h3")?.textContent).toBe("Intro call");
    expect(own.textContent).toContain('Booking.minutes:{"minutes":30}');
    expect(own.textContent).toContain("Booking.placeVideo");
    expect(own.querySelector("[data-value]")?.getAttribute("data-value")).toBe(MINE.url);
    expect(own.querySelector("[data-value]")?.textContent).toContain("tok_abcdefghijklmnop");
    expect(own.querySelector("[data-booking-status]")?.textContent).toBe('Booking.upcomingCount:{"count":3}');

    const other = row(ADA.id);
    expect(other.textContent).toContain("Booking.placeInPerson");
    expect(other.querySelector("[data-booking-status]")?.textContent).toBe("Booking.paused");
    expect(container.querySelector('[data-booking-group="owner"] h3')?.textContent).toBe(
      'Booking.panelOwner:{"owner":"Ada Lovelace"}',
    );
    expect(container.querySelector('[data-booking-group="own"] h3')?.textContent).toBe("Booking.panelYours");
  });

  it("offers edit, open and delete on the caller's own page and only open on someone else's", async () => {
    await renderPanel(ready());

    const mine = menuOf("Intro call");
    expect(hasButton(mine, "Booking.edit")).toBe(true);
    expect(buttonWithText(mine, "Common.actions.delete").getAttribute("data-variant")).toBe("destructive");
    expect(mine.querySelector("a")?.getAttribute("href")).toBe("/book/tok_abcdefghijklmnop");
    expect(row(MINE.id).querySelector<HTMLButtonElement>('[role="switch"]')?.disabled).toBe(false);

    const others = menuOf("Support");
    expect(hasButton(others, "Booking.edit")).toBe(false);
    expect(hasButton(others, "Common.actions.delete")).toBe(false);
    expect(others.querySelector("a")?.getAttribute("href")).toBe("/book/tok_adaadaadaadaadaada");
    expect(row(ADA.id).querySelector<HTMLButtonElement>('[role="switch"]')?.disabled).toBe(true);
  });

  it("opens the booking modal in edit mode from the menu and in create mode from the header", async () => {
    await renderPanel(ready());

    act(() => buttonWithText(menuOf("Intro call"), "Booking.edit").click());
    expect(harness.modal.start).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: MINE.id }), null);

    harness.modal.start.mockClear();
    act(() => newPageButton().click());
    expect(harness.modal.start).toHaveBeenCalledExactlyOnceWith();
  });

  it("copies the public link from the link pill", async () => {
    await renderPanel(ready());

    await act(async () => {
      row(MINE.id).querySelector<HTMLButtonElement>('button[aria-label="Common.actions.copy"]')?.click();
      await Promise.resolve();
    });

    expect(harness.copy).toHaveBeenCalledWith(MINE.url);
  });

  it("saves the enabled switch for the page and refreshes the calendar page", async () => {
    await renderPanel(ready());
    const toggle = row(MINE.id).querySelector<HTMLButtonElement>('[role="switch"]');

    await act(async () => {
      toggle?.click();
      await Promise.resolve();
    });

    expect(harness.save).toHaveBeenCalledExactlyOnceWith({ id: MINE.id, enabled: false });
    expect(harness.refresh).toHaveBeenCalledOnce();
    expect(row(MINE.id).querySelector("[data-booking-status]")?.textContent).toBe("Booking.paused");
  });

  it("puts the switch back and reports the error when the save is refused", async () => {
    harness.save.mockResolvedValue({ ok: false, error: { errors: ["no"] } });
    await renderPanel(ready());
    const toggle = row(MINE.id).querySelector<HTMLButtonElement>('[role="switch"]');

    await act(async () => {
      toggle?.click();
      await Promise.resolve();
    });

    expect(harness.toastError).toHaveBeenCalledOnce();
    expect(harness.refresh).not.toHaveBeenCalled();
    expect(row(MINE.id).querySelector('[role="switch"]')?.getAttribute("aria-checked")).toBe("true");
  });

  it("deletes the page and drops its row", async () => {
    await renderPanel(ready());

    await act(async () => {
      buttonWithText(menuOf("Intro call"), "Common.actions.delete").click();
      await Promise.resolve();
    });

    expect(harness.remove).toHaveBeenCalledExactlyOnceWith({ id: MINE.id });
    expect(container.querySelector(`[data-booking-link="${MINE.id}"]`)).toBeNull();
    expect(harness.refresh).toHaveBeenCalledOnce();
  });

  it("keeps the page and reports why when the delete is refused over upcoming bookings", async () => {
    const error = { errors: ["This booking page still has upcoming bookings (2)."] };
    harness.remove.mockResolvedValue({ ok: false, error });
    await renderPanel(ready());

    await act(async () => {
      buttonWithText(menuOf("Intro call"), "Common.actions.delete").click();
      await Promise.resolve();
    });

    expect(harness.toastError).toHaveBeenCalledExactlyOnceWith(error);
    expect(container.querySelector(`[data-booking-link="${MINE.id}"]`)).not.toBeNull();
    expect(harness.refresh).not.toHaveBeenCalled();
  });

  it("hands the setup, the refresh, the hosts and the read-only flag to the booking modal", async () => {
    await renderPanel(ready());
    expect(harness.modal.configure).toHaveBeenCalledWith(READY_SETUP, expect.any(Function), undefined, false);

    const hostCandidates = [{ userId: "40000000-0000-4000-8000-000000000001", name: "Ana Host" }];
    await renderPanel({ status: "ready", links: [MINE], setup: READY_SETUP, hostCandidates, readOnly: true });
    expect(harness.modal.configure).toHaveBeenLastCalledWith(READY_SETUP, expect.any(Function), hostCandidates, true);
  });

  it("lists upcoming bookings grouped by day with today and tomorrow named, and the host on team pages", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 20, 8, 0));
    const team = bookingLink({
      assignment: "roundRobin",
      hosts: [{ userId: "40000000-0000-4000-8000-000000000001", name: "Ana Host", calendarName: "Work" }],
    });
    const at = (day: number, hour: number) => new Date(2026, 10, day, hour, 0).toISOString();
    const upcoming = [
      upcomingBooking("b3", team.id, at(25, 9), "Visitor 3"),
      upcomingBooking("b1", team.id, at(20, 14), "Visitor 1"),
      upcomingBooking("b2", team.id, at(21, 10), "Visitor 2"),
      upcomingBooking("other", ADA.id, at(21, 15), "Grace"),
    ];

    await renderPanel({ status: "ready", links: [team, ADA], setup: READY_SETUP, upcoming });

    const section = container.querySelector<HTMLElement>("[data-booking-upcoming]");
    expect(section?.querySelector("h3")?.textContent).toBe("Booking.upcomingTitle");
    const days = [...(section?.querySelectorAll("[data-booking-upcoming-day]") ?? [])];
    expect(days.map((day) => day.querySelector("h4")?.textContent)).toEqual([
      "Booking.today",
      "Booking.tomorrow",
      expect.stringMatching(/^day 11-25$/u),
    ]);
    expect(days[1]?.querySelectorAll("[data-booking-upcoming-item]")).toHaveLength(2);
    const first = section?.querySelector<HTMLElement>('[data-booking-upcoming-item="b1"]');
    expect(first?.textContent).toContain("Visitor 1");
    expect(first?.textContent).toContain("Intro call · Ana Host");
    expect(section?.querySelector('[data-booking-upcoming-item="other"]')?.textContent).not.toContain("Ana Host");
    expect(first?.querySelector("[data-booking-host-reschedule]")?.textContent).toBe("Booking.hostActions.reschedule");
    expect(first?.querySelector("[data-booking-host-cancel]")?.getAttribute("data-variant")).toBe("destructive");
  });

  it("shows the empty state with a create button when there are no pages", async () => {
    await renderPanel(ready([]));

    expect(container.querySelector("[data-page-state]")?.textContent).toContain("Booking.empty");
    expect(container.querySelector("[data-booking-upcoming]")).toBeNull();
  });

  it("keeps a page whose calendar is gone, says it is unavailable and lets its owner choose a calendar", async () => {
    const orphan = bookingLink({ calendarId: null, calendarName: null, upcomingBookings: 2 });
    const others = bookingLink({ ...ADA, calendarId: null, calendarName: null, enabled: true });
    await renderPanel(ready([orphan, others]));

    const own = row(orphan.id);
    expect(own.querySelector("[data-booking-calendar-missing]")?.textContent).toContain("Booking.noCalendar");
    expect(own.querySelector("[data-booking-status]")?.textContent).toBe("Booking.panelUnavailable");
    const choose = buttonWithText(own, "Booking.chooseCalendar");
    act(() => choose.click());
    expect(harness.modal.start).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: orphan.id }), choose);

    const other = row(others.id);
    expect(other.querySelector("[data-booking-calendar-missing]")).not.toBeNull();
    expect(hasButton(other, "Booking.chooseCalendar")).toBe(false);
  });

  it("tells the owner when the calendar could not be read in full, and stays quiet otherwise", async () => {
    await renderPanel(ready());
    expect(container.querySelector("[data-booking-busy-incomplete]")).toBeNull();

    await renderPanel({ status: "ready", links: [MINE, ADA], setup: READY_SETUP, busyTimeIncomplete: true });
    expect(container.querySelector("[data-booking-busy-incomplete]")?.textContent).toContain(
      "Booking.busyTimeIncomplete",
    );
  });

  it("explains a missing calendar and does not allow a new page", async () => {
    await renderPanel(ready([], { ...READY_SETUP, blockedReason: "noCalendar" }));

    expect(container.textContent).toContain("ScheduleMeeting.blocked.noCalendar");
    expect(container.querySelector("#connect-calendar")).not.toBeNull();
    expect(newPageButton().disabled).toBe(true);
  });

  it("shows the pages read-only in the demo: no new page, no switch, no delete, no booking changes", async () => {
    const upcoming = [upcomingBooking("b1", MINE.id, "2030-01-07T09:00:00.000Z", "Visitor 1")];
    await renderPanel({ status: "ready", links: [MINE], setup: READY_SETUP, upcoming, readOnly: true });

    expect(container.querySelector("[data-booking-read-only]")?.textContent).toContain("Booking.demoNote");
    expect(newPageButton().disabled).toBe(true);
    expect(row(MINE.id).querySelector<HTMLButtonElement>('[role="switch"]')?.disabled).toBe(true);
    const menu = menuOf("Intro call");
    expect(hasButton(menu, "Booking.edit")).toBe(true);
    expect(hasButton(menu, "Common.actions.delete")).toBe(false);
    const actions = container.querySelector('[data-booking-host-actions="b1"] [data-test-trigger]');
    expect(actions?.getAttribute("data-disabled")).toBe("true");
    expect(actions?.querySelector("[data-booking-host-cancel]")).toBeNull();
  });

  it.each([
    ["demo", "Booking.demoNote"],
    ["selfHosted", "Booking.selfHostedNote"],
    ["locked", "Booking.panelLocked"],
  ] as const)("says why booking pages are unavailable (%s) and offers no new page", async (reason, note) => {
    await renderPanel({ status: "unavailable", reason });

    expect(container.textContent).toContain(note);
    expect(buttonWithText(container, "Booking.newShort").disabled).toBe(true);
    expect(harness.modal.configure).not.toHaveBeenCalled();
  });

  it("closes from its close button and from Escape", async () => {
    await renderPanel(ready());

    act(() => container.querySelector<HTMLButtonElement>('[data-slot="sheet-close"]')?.click());
    expect(onClose).toHaveBeenCalledOnce();

    act(() => {
      container
        .querySelector("[data-booking-panel]")
        ?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
