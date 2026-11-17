import type { Root } from "react-dom/client";
import type { BookingPanelState } from "../booking/booking-panel-model";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  modal: { start: vi.fn(), configure: vi.fn() },
  refresh: vi.fn(),
  save: vi.fn(),
  remove: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}));
vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => ({ bookingLinkModalStore: harness.modal }),
}));
vi.mock("@/i18n/navigation", () => ({
  IntlLink: ({ children, href }: { children: unknown; href: string }) =>
    createElement("a", { href, "data-intl-link": "" }, children as never),
  useRouter: () => ({ refresh: harness.refresh }),
}));
vi.mock("../../booking-actions", () => ({
  saveBookingLinkAction: harness.save,
  deleteBookingLinkAction: harness.remove,
}));
vi.mock("@/core/errors/report-application-error", () => ({
  runUserAction: (action: () => unknown) => void action(),
  reportApplicationError: vi.fn(),
}));
vi.mock("@/core/utils/toast-zod-error-tree", () => ({ toastZodErrorTree: harness.toastError }));
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
vi.mock("@/components/shared/copyable-code", () => ({
  CopyableCode: ({ value }: { value: string }) => createElement("code", { "data-copyable": "" }, value),
}));
vi.mock("@/components/page-state/page-state", () => ({
  PageState: ({ title, action }: { title: string; action: unknown }) =>
    createElement("div", { "data-page-state": "" }, title, action as never),
}));

import { BookingPanel } from "../booking/booking-panel";

import { bookingLink, READY_SETUP } from "./booking-fixtures";

const MINE = bookingLink();
const ADA = bookingLink({
  id: "20000000-0000-4000-8000-000000000002",
  token: "tok_adaadaadaadaadaada",
  url: "https://app.example.com/book/tok_adaadaadaadaadaada",
  title: "Support",
  ownerName: "Ada Lovelace",
  own: false,
  enabled: false,
});

let container: HTMLDivElement;
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

function buttonWithText(scope: HTMLElement, text: string): HTMLButtonElement {
  const found = [...scope.querySelectorAll("button")].find((button) => button.textContent?.includes(text));
  if (!found) throw new Error(`Button ${text} did not render.`);
  return found;
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  harness.save.mockResolvedValue({ ok: true, data: {} });
  harness.remove.mockResolvedValue({ ok: true, data: {} });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("BookingPanel", () => {
  it("lists a row per page with its name, length and public link, and groups other people's pages by owner", async () => {
    await renderPanel(ready());

    const own = row(MINE.id);
    expect(own.querySelector("h3")?.textContent).toBe("Intro call");
    expect(own.textContent).toContain('Booking.minutes:{"minutes":30}');
    expect(own.querySelector("[data-copyable]")?.textContent).toBe(MINE.url);

    expect(container.querySelector('[data-booking-group="owner"] h3')?.textContent).toBe(
      'Booking.panelOwner:{"owner":"Ada Lovelace"}',
    );
    expect(container.querySelector('[data-booking-group="own"] h3')?.textContent).toBe("Booking.panelYours");
    expect(row(ADA.id).querySelector("[data-copyable]")?.textContent).toBe(ADA.url);
  });

  it("offers edit, switch and delete on the caller's own page only", async () => {
    await renderPanel(ready());

    const own = row(MINE.id);
    expect(buttonWithText(own, "Booking.edit")).toBeTruthy();
    expect(buttonWithText(own, "Common.actions.delete")).toBeTruthy();
    expect(own.querySelector<HTMLButtonElement>('[role="switch"]')?.disabled).toBe(false);

    const other = row(ADA.id);
    expect([...other.querySelectorAll("button")].some((button) => button.textContent?.includes("Booking.edit"))).toBe(
      false,
    );
    expect([...other.querySelectorAll("button")].some((button) => button.textContent?.includes("delete"))).toBe(false);
    expect(other.querySelector<HTMLButtonElement>('[role="switch"]')?.disabled).toBe(true);
    expect(other.textContent).toContain("Booking.paused");
    expect(other.querySelector("a")?.getAttribute("href")).toBe("/book/tok_adaadaadaadaadaada");
  });

  it("opens the booking modal in edit mode with the page and its button", async () => {
    await renderPanel(ready());
    const edit = buttonWithText(row(MINE.id), "Booking.edit");

    act(() => edit.click());

    expect(harness.modal.start).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: MINE.id }), edit);
  });

  it("opens the booking modal in create mode from the new page button", async () => {
    await renderPanel(ready());

    act(() => buttonWithText(container, "Booking.new").click());

    expect(harness.modal.start).toHaveBeenCalledExactlyOnceWith();
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
    expect(row(MINE.id).textContent).toContain("Booking.paused");
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
      buttonWithText(row(MINE.id), "Common.actions.delete").click();
      await Promise.resolve();
    });

    expect(harness.remove).toHaveBeenCalledExactlyOnceWith({ id: MINE.id });
    expect(container.querySelector(`[data-booking-link="${MINE.id}"]`)).toBeNull();
    expect(harness.refresh).toHaveBeenCalledOnce();
  });

  it("hands the setup and the refresh to the booking modal", async () => {
    await renderPanel(ready());

    expect(harness.modal.configure).toHaveBeenCalledWith(READY_SETUP, expect.any(Function));
  });

  it("shows the empty state with a create button when there are no pages", async () => {
    await renderPanel(ready([]));

    expect(container.querySelector("[data-page-state]")?.textContent).toContain("Booking.empty");
  });

  it("keeps a page whose calendar is gone, says it is unavailable and lets its owner choose a calendar", async () => {
    const orphan = bookingLink({ calendarId: null, calendarName: null, upcomingBookings: 2 });
    const others = bookingLink({ ...ADA, calendarId: null, calendarName: null, enabled: true });
    await renderPanel(ready([orphan, others]));

    const own = row(orphan.id);
    expect(own.querySelector("[data-booking-calendar-missing]")?.textContent).toContain("Booking.noCalendar");
    expect(own.textContent).toContain("Booking.panelUnavailable");
    expect(own.textContent).not.toContain("Booking.panelActive");
    expect(own.textContent).toContain('Booking.upcoming:{"count":2}');
    const choose = buttonWithText(own, "Booking.chooseCalendar");
    act(() => choose.click());
    expect(harness.modal.start).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: orphan.id }), choose);

    const other = row(others.id);
    expect(other.querySelector("[data-booking-calendar-missing]")).not.toBeNull();
    expect(
      [...other.querySelectorAll("button")].some((button) => button.textContent?.includes("Booking.chooseCalendar")),
    ).toBe(false);
  });

  it("shows no calendar warning on a page that has its calendar", async () => {
    await renderPanel(ready());

    expect(container.querySelector("[data-booking-calendar-missing]")).toBeNull();
    expect(row(MINE.id).textContent).toContain("Booking.panelActive");
  });

  it("tells the owner when the calendar could not be read in full, and stays quiet otherwise", async () => {
    await renderPanel(ready());
    expect(container.querySelector("[data-booking-busy-incomplete]")).toBeNull();

    await renderPanel({ ...ready(), busyTimeIncomplete: true });
    expect(container.querySelector("[data-booking-busy-incomplete]")?.textContent).toContain(
      "Booking.busyTimeIncomplete",
    );
  });

  it("explains a missing calendar and does not allow a new page", async () => {
    await renderPanel(ready([], { ...READY_SETUP, blockedReason: "noCalendar" }));

    expect(container.textContent).toContain("ScheduleMeeting.blocked.noCalendar");
    expect(container.querySelector("#connect-calendar")).not.toBeNull();
    expect(buttonWithText(container.querySelector("header") as HTMLElement, "Booking.new").disabled).toBe(true);
  });

  it.each([
    ["demo", "Booking.demoNote"],
    ["selfHosted", "Booking.selfHostedNote"],
    ["locked", "Booking.panelLocked"],
  ] as const)("says why booking pages are unavailable (%s) and offers no new page", async (reason, note) => {
    await renderPanel({ status: "unavailable", reason });

    expect(container.textContent).toContain(note);
    expect(buttonWithText(container, "Booking.new").disabled).toBe(true);
    expect(harness.modal.configure).not.toHaveBeenCalled();
  });

  it("closes from its close button", async () => {
    await renderPanel(ready());

    act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Booking.panelClose"]')?.click());

    expect(onClose).toHaveBeenCalledOnce();
  });
});
