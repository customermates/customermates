import type { Root } from "react-dom/client";
import type { BookingSetup } from "@/ee/calendar/booking-setup";
import type { PublicBookingPage } from "@/ee/calendar/booking.schema";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { observable, runInAction } from "mobx";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  rootStore: null as unknown,
  readSlots: vi.fn(),
  submit: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
  useLocale: () => "en",
}));
vi.mock("@/core/stores/root-store.provider", () => ({ useRootStore: () => harness.rootStore }));
vi.mock("@/app/[locale]/(public)/book/[token]/actions", () => ({
  readPublicBookingSlotsAction: harness.readSlots,
  submitPublicBookingAction: harness.submit,
}));
vi.mock("@/components/ui/calendar", () => ({
  Calendar: ({ endMonth, onMonthChange }: { endMonth?: Date; onMonthChange?: (month: Date) => void }) =>
    createElement(
      "div",
      { "data-day-picker": "", "data-end-month": endMonth?.toISOString() },
      createElement("button", {
        type: "button",
        "data-later-month": "",
        onClick: () => onMonthChange?.(new Date(Date.now() + 70 * 86_400_000)),
      }),
    ),
}));
vi.mock("@/core/errors/report-application-error", () => ({
  runUserAction: (action: () => unknown) => void action(),
  reportApplicationError: vi.fn(),
}));

import { BookingPreview } from "../booking/booking-preview";
import { PublicBookingView } from "@/app/[locale]/(public)/book/[token]/public-booking-view";
import { DEFAULT_WORKING_HOURS } from "@/ee/calendar/working-hours";

import { READY_SETUP, bookingForm } from "./booking-fixtures";

let container: HTMLDivElement;
let root: Root;
let modal: { form: ReturnType<typeof bookingForm>; setup: BookingSetup };

async function renderPreview(setup: BookingSetup = READY_SETUP) {
  modal = observable({ form: bookingForm(), setup });
  harness.rootStore = {
    bookingLinkModalStore: modal,
    userStore: { user: { firstName: "Test", lastName: "User" } },
    workspacesStore: { current: { name: "Acme" } },
  };
  await act(async () => {
    root.render(createElement(BookingPreview));
    await Promise.resolve();
  });
}

const title = () => container.querySelector("#public-booking-title")?.textContent;
const slotButtons = () => [...container.querySelectorAll<HTMLButtonElement>("[data-booking-slots] button")];

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("BookingPreview", () => {
  it("renders the public booking view read-only with the host, the title and the length of the draft", async () => {
    await renderPreview();

    expect(container.querySelector("[data-booking-preview-pane]")).not.toBeNull();
    expect(container.querySelector("[data-booking-preview]")).not.toBeNull();
    expect(container.querySelector("#public-booking")).toBeNull();
    expect(container.querySelector("#public-booking-badge")).toBeNull();
    expect(title()).toBe("Intro call");
    expect(container.textContent).toContain("Test User");
    expect(container.textContent).toContain('PublicBooking.minutes:{"minutes":30}');
  });

  it("shows neither a logo nor an accent colour in the preview without a brand", async () => {
    await renderPreview();

    expect(container.querySelector("[data-brand-logo]")).toBeNull();
    expect(container.querySelector<HTMLElement>("[data-booking-preview]")?.getAttribute("style")).toBeNull();
  });

  it("shows the workspace's logo and accent colour in the preview", async () => {
    await renderPreview({
      ...READY_SETUP,
      brand: { accentColor: "#1d4ed8", logoUrl: "/api/brand/logo/logo_key_abcdefghijkl" },
    });
    const frame = container.querySelector<HTMLElement>("[data-booking-preview]");
    expect(container.querySelector("aside img[data-brand-logo]")?.getAttribute("src")).toBe(
      "/api/brand/logo/logo_key_abcdefghijkl",
    );
    expect(container.querySelector<HTMLImageElement>("aside img[data-brand-logo]")?.alt).toBe("Acme");
    expect(frame?.style.getPropertyValue("--primary")).toBe("#1d4ed8");
    expect(frame?.style.getPropertyValue("--primary-foreground")).toBe("white");
  });

  it("offers the slots computed from the working hours and never asks the server for any", async () => {
    await renderPreview();

    expect(slotButtons().length).toBeGreaterThan(0);
    expect(harness.readSlots).not.toHaveBeenCalled();
  });

  it("follows the draft as it changes: the title and the closed days", async () => {
    await renderPreview();

    act(() => {
      runInAction(() => {
        modal.form.title = "Product demo";
      });
    });
    expect(title()).toBe("Product demo");

    act(() => {
      runInAction(() => {
        modal.form.title = "  ";
      });
    });
    expect(title()).toBe("Booking.pagePreviewTitle");

    act(() => {
      runInAction(() => {
        modal.form.workingHours = Object.fromEntries(
          Object.keys(DEFAULT_WORKING_HOURS).map((day) => [day, []]),
        ) as unknown as typeof modal.form.workingHours;
      });
    });
    expect(container.textContent).toContain("PublicBooking.noSlots");
    expect(slotButtons()).toHaveLength(0);
  });

  it("shows the visitor form after picking a time but keeps it read-only and sends nothing", async () => {
    await renderPreview();

    act(() => {
      slotButtons()[0].click();
    });
    const form = container.querySelector<HTMLElement>("[data-booking-form]");
    expect(form).not.toBeNull();
    expect(form?.tagName).toBe("DIV");
    expect(container.querySelector("form")).toBeNull();
    expect(form?.querySelector<HTMLInputElement>("#booking-name")?.disabled).toBe(true);
    expect(form?.querySelector<HTMLInputElement>("#booking-email")?.disabled).toBe(true);
    expect(form?.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true);

    act(() => {
      form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(harness.submit).not.toHaveBeenCalled();
  });
});

describe("PublicBookingView on the live page", () => {
  const DAY_MS = 86_400_000;
  const LIVE_PAGE: PublicBookingPage = {
    title: "Intro call",
    description: null,
    durationMinutes: 30,
    horizonDays: 90,
    timeZone: "UTC",
    workspaceName: "Acme",
    hostName: "Test User",
    team: false,
    withVideo: false,
    questions: [],
    renderToken: "render",
    brand: null,
    badge: false,
  };
  const BRAND = { accentColor: "#fde047", logoUrl: "/api/brand/logo/logo_key_abcdefghijkl" };
  const slotIn = (days: number) => {
    const startsAt = new Date(Date.now() + days * DAY_MS).toISOString();
    return { startsAt, endsAt: new Date(Date.parse(startsAt) + 30 * 60_000).toISOString() };
  };
  const settle = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));

  async function renderLive(page: PublicBookingPage = LIVE_PAGE) {
    await act(async () => {
      root.render(createElement(PublicBookingView, { page, token: "tok_abcdefghijklmnop" }));
      await Promise.resolve();
    });
    await settle();
  }

  it("looks as before without a brand: the initials, and the app's own primary colour", async () => {
    harness.readSlots.mockResolvedValue({ status: "available", timeZone: "UTC", slots: [slotIn(2)], nextFrom: null });
    await renderLive();

    const frame = container.querySelector<HTMLElement>("#public-booking");
    expect(container.querySelector("[data-brand-logo]")).toBeNull();
    expect(container.querySelector('aside [data-slot="avatar"]')).not.toBeNull();
    expect(frame?.getAttribute("style")).toBeNull();
    expect(frame?.hasAttribute("data-brand-accent")).toBe(false);
  });

  it("shows the workspace's logo instead of the initials and sets the accent colour on the frame only", async () => {
    harness.readSlots.mockResolvedValue({ status: "available", timeZone: "UTC", slots: [slotIn(2)], nextFrom: null });
    await renderLive({ ...LIVE_PAGE, brand: BRAND });

    const frame = container.querySelector<HTMLElement>("#public-booking");
    const logo = container.querySelector<HTMLImageElement>("aside img[data-brand-logo]");
    expect(logo?.getAttribute("src")).toBe(BRAND.logoUrl);
    expect(logo?.alt).toBe("Acme");
    expect(container.querySelector('aside [data-slot="avatar"]')).toBeNull();
    expect(container.querySelector("aside")?.textContent).toContain("Test User · Acme");
    expect(frame?.dataset.brandAccent).toBe("#fde047");
    expect(frame?.style.getPropertyValue("--primary")).toBe("#fde047");
    expect(frame?.style.getPropertyValue("--primary-foreground")).toBe("black");
    expect(document.documentElement.style.getPropertyValue("--primary")).toBe("");
  });

  it("shows the badge only on a page whose workspace plan carries it", async () => {
    harness.readSlots.mockResolvedValue({ status: "available", timeZone: "UTC", slots: [slotIn(2)], nextFrom: null });
    await renderLive();
    expect(container.querySelector("#public-booking-badge")).toBeNull();

    await renderLive({ ...LIVE_PAGE, badge: true });
    expect(container.querySelector("#public-booking-badge")).not.toBeNull();
  });

  it("keeps the logo and the accent colour on the confirmation", async () => {
    harness.readSlots.mockResolvedValue({ status: "available", timeZone: "UTC", slots: [slotIn(2)], nextFrom: null });
    harness.submit.mockResolvedValue({
      status: "booked",
      startsAt: slotIn(2).startsAt,
      endsAt: slotIn(2).endsAt,
      conferenceUrl: null,
      title: "Intro call",
      hostName: "Test User",
      manageUrl: null,
      successMessage: null,
    });
    await renderLive({ ...LIVE_PAGE, brand: { ...BRAND, accentColor: "#1d4ed8" } });
    act(() => slotButtons()[0].click());
    await act(async () => {
      container
        .querySelector("[data-booking-form]")
        ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });
    await settle();

    const frame = container.querySelector<HTMLElement>("#public-booking");
    expect(container.querySelector("[data-booking-confirmed] img[data-brand-logo]")?.getAttribute("src")).toBe(
      BRAND.logoUrl,
    );
    expect(frame?.style.getPropertyValue("--primary")).toBe("#1d4ed8");
    expect(frame?.style.getPropertyValue("--primary-foreground")).toBe("white");
  });

  it("loads the first range, then the later ranges once the visitor moves to a month beyond it", async () => {
    const second = new Date(Date.now() + 31 * DAY_MS).toISOString();
    const third = new Date(Date.now() + 62 * DAY_MS).toISOString();
    harness.readSlots
      .mockResolvedValueOnce({ status: "available", timeZone: "UTC", slots: [slotIn(2)], nextFrom: second })
      .mockResolvedValueOnce({ status: "available", timeZone: "UTC", slots: [slotIn(40)], nextFrom: third })
      .mockResolvedValueOnce({ status: "available", timeZone: "UTC", slots: [slotIn(75)], nextFrom: null });

    await renderLive();

    expect(harness.readSlots).toHaveBeenCalledExactlyOnceWith({ token: "tok_abcdefghijklmnop", days: 31 });
    expect(slotButtons()).toHaveLength(1);
    const horizon = Date.parse(container.querySelector<HTMLElement>("[data-day-picker]")?.dataset.endMonth ?? "");
    expect(Math.round((horizon - Date.now()) / DAY_MS)).toBe(90);

    act(() => container.querySelector<HTMLButtonElement>("[data-later-month]")?.click());
    await settle();

    expect(harness.readSlots.mock.calls.map(([input]) => input.from)).toEqual([undefined, second, third]);
    expect(container.querySelector("[data-booking-calendar]")?.getAttribute("aria-busy")).toBe("false");
  });

  it("keeps looking in later ranges when the first weeks have no free time", async () => {
    const second = new Date(Date.now() + 31 * DAY_MS).toISOString();
    harness.readSlots
      .mockResolvedValueOnce({ status: "available", timeZone: "UTC", slots: [], nextFrom: second })
      .mockResolvedValueOnce({ status: "available", timeZone: "UTC", slots: [slotIn(45)], nextFrom: null });

    await renderLive();

    expect(harness.readSlots).toHaveBeenCalledTimes(2);
    expect(container.textContent).not.toContain("PublicBooking.noSlots");
    expect(slotButtons()).toHaveLength(1);
  });

  it("submits through a real form on the live page", async () => {
    harness.readSlots.mockResolvedValue({ status: "available", timeZone: "UTC", slots: [slotIn(2)], nextFrom: null });
    await renderLive();

    act(() => slotButtons()[0].click());

    expect(container.querySelector("[data-booking-form]")?.tagName).toBe("FORM");
  });

  it("replaces the calendar with the form once a time is chosen, shows the time beside it, and goes back", async () => {
    harness.readSlots.mockResolvedValue({ status: "available", timeZone: "UTC", slots: [slotIn(2)], nextFrom: null });
    await renderLive();

    expect(container.querySelector("aside [data-booking-when]")).toBeNull();
    act(() => slotButtons()[0].click());

    expect(container.querySelector("[data-booking-calendar]")?.closest(".hidden")).not.toBeNull();
    expect(container.querySelector("[data-booking-slots]")?.closest(".hidden")).not.toBeNull();
    expect(container.querySelector("aside #public-booking-title")?.textContent).toBe("Intro call");
    expect(container.querySelector("aside [data-booking-when]")).not.toBeNull();

    act(() => container.querySelector<HTMLButtonElement>("[data-booking-back]")?.click());

    expect(container.querySelector("[data-booking-form]")).toBeNull();
    expect(container.querySelector("[data-booking-calendar]")?.closest(".hidden")).toBeNull();
    expect(container.querySelector("aside [data-booking-when]")).toBeNull();
    expect(slotButtons()).toHaveLength(1);
  });

  it("confirms with the host who takes the meeting and the private link to change it", async () => {
    harness.readSlots.mockResolvedValue({ status: "available", timeZone: "UTC", slots: [slotIn(2)], nextFrom: null });
    harness.submit.mockResolvedValue({
      status: "booked",
      startsAt: slotIn(2).startsAt,
      endsAt: slotIn(2).endsAt,
      conferenceUrl: null,
      title: "Intro call",
      hostName: "Ana Host",
      manageUrl: "https://app.example.com/book/manage/manage_abcdefghijklmnop",
      successMessage: null,
    });
    await renderLive();
    act(() => slotButtons()[0].click());

    await act(async () => {
      container
        .querySelector("[data-booking-form]")
        ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });
    await settle();

    expect(harness.submit).toHaveBeenCalledOnce();
    expect(container.querySelector("[data-booking-confirmed]")?.textContent).toContain(
      'PublicBooking.with:{"host":"Ana Host"}',
    );
    expect(container.querySelector<HTMLAnchorElement>("[data-booking-manage-link]")?.href).toBe(
      "https://app.example.com/book/manage/manage_abcdefghijklmnop",
    );
  });

  it("leaves the manage link out when the page does not let visitors change bookings", async () => {
    harness.readSlots.mockResolvedValue({ status: "available", timeZone: "UTC", slots: [slotIn(2)], nextFrom: null });
    harness.submit.mockResolvedValue({
      status: "booked",
      startsAt: slotIn(2).startsAt,
      endsAt: slotIn(2).endsAt,
      conferenceUrl: null,
      title: "Intro call",
      hostName: "Test User",
      manageUrl: null,
      successMessage: null,
    });
    await renderLive();
    act(() => slotButtons()[0].click());

    await act(async () => {
      container
        .querySelector("[data-booking-form]")
        ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });
    await settle();

    expect(container.querySelector("[data-booking-confirmed]")).not.toBeNull();
    expect(container.querySelector("[data-booking-manage-link]")).toBeNull();
  });
});
