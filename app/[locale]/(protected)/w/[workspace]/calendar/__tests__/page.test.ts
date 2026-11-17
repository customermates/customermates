import type { ReactElement } from "react";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAccess: vi.fn(),
  options: vi.fn(),
  booking: vi.fn(),
}));

vi.mock("@/features/auth/next/require", () => ({ requireAccess: mocks.requireAccess }));
vi.mock("@/core/di", () => ({ getGetPlannerOptionsInteractor: () => ({ invoke: mocks.options }) }));
vi.mock("@/components/shared/page-container", () => ({ PageContainer: "page-container" }));
vi.mock("../booking-panel-data", () => ({ loadBookingPanel: mocks.booking }));
vi.mock("../components/planner-page-view", () => ({ PlannerPageView: "planner-page-view" }));

import CalendarPage from "../page";

const OPTIONS = { personalAvailable: true, calendars: [] };
const READY = {
  status: "ready",
  links: [],
  setup: { calendars: [], lists: [], relationships: [], blockedReason: null },
};

async function renderPage(params: Record<string, string | string[] | undefined> = {}) {
  const page = (await CalendarPage({ searchParams: Promise.resolve(params) })) as ReactElement<{
    children: ReactElement<Record<string, unknown>>;
  }>;
  return page.props.children.props;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.options.mockResolvedValue({ ok: true, data: OPTIONS });
  mocks.booking.mockResolvedValue(READY);
});

describe("CalendarPage booking panel", () => {
  it("opens the booking panel for the link the old settings route redirects to", async () => {
    const props = await renderPage({ panel: "booking" });

    expect(props.bookingRequested).toBe(true);
    expect(props.booking).toBe(READY);
    expect(props.options).toBe(OPTIONS);
    expect(mocks.booking).toHaveBeenCalledExactlyOnceWith(OPTIONS);
  });

  it("leaves the panel closed without the parameter or with another value", async () => {
    expect((await renderPage()).bookingRequested).toBe(false);
    expect((await renderPage({ panel: "sources" })).bookingRequested).toBe(false);
  });

  it("still hands the panel state over when booking pages are unavailable", async () => {
    mocks.booking.mockResolvedValue({ status: "unavailable", reason: "selfHosted" });

    const props = await renderPage({ panel: "booking" });

    expect(props.booking).toEqual({ status: "unavailable", reason: "selfHosted" });
  });
});
