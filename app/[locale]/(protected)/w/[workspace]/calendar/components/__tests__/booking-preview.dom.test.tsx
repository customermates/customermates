import type { Root } from "react-dom/client";

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
  Calendar: () => createElement("div", { "data-day-picker": "" }),
}));
vi.mock("@/core/errors/report-application-error", () => ({
  runUserAction: (action: () => unknown) => void action(),
  reportApplicationError: vi.fn(),
}));

import { BookingPreview } from "../booking/booking-preview";
import { DEFAULT_WORKING_HOURS } from "@/ee/calendar/working-hours";

import { READY_SETUP, bookingForm } from "./booking-fixtures";

let container: HTMLDivElement;
let root: Root;
let modal: { form: ReturnType<typeof bookingForm>; setup: typeof READY_SETUP };

async function renderPreview() {
  modal = observable({ form: bookingForm(), setup: READY_SETUP });
  harness.rootStore = {
    bookingLinkModalStore: modal,
    userStore: { user: { firstName: "Test", lastName: "User" } },
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
    expect(title()).toBe("Intro call");
    expect(container.textContent).toContain("Test User");
    expect(container.textContent).toContain('PublicBooking.minutes:{"minutes":30}');
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
    const form = container.querySelector<HTMLFormElement>("[data-booking-form]");
    expect(form).not.toBeNull();
    expect(form?.querySelector<HTMLInputElement>("#booking-name")?.disabled).toBe(true);
    expect(form?.querySelector<HTMLInputElement>("#booking-email")?.disabled).toBe(true);
    expect(form?.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true);

    act(() => {
      form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(harness.submit).not.toHaveBeenCalled();
  });
});
