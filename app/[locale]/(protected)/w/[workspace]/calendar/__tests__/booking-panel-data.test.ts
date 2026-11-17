import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  env: { APP_MODE: "cloud" },
  links: vi.fn(),
  meeting: vi.fn(),
  model: vi.fn(),
}));

vi.mock("@/env", () => ({ env: mocks.env }));
vi.mock("@/core/di", () => ({
  getGetWorkspaceBookingLinksInteractor: () => ({ invoke: mocks.links }),
  getGetMeetingOptionsInteractor: () => ({ invoke: mocks.meeting }),
  getGetRecordModelInteractor: () => ({ invoke: mocks.model }),
}));

import { loadBookingPanel } from "../booking-panel-data";

import { bookingLink } from "../components/__tests__/booking-fixtures";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.env.APP_MODE = "cloud";
  mocks.links.mockResolvedValue({ ok: true, data: { items: [bookingLink()], busyTimeIncomplete: true } });
  mocks.meeting.mockResolvedValue({ ok: true, data: { calendars: [], blockedReason: "noCalendar" } });
  mocks.model.mockResolvedValue({ ok: true, data: { types: [], fields: [], relationships: [] } });
});

describe("loadBookingPanel", () => {
  it("says booking pages are not part of the demo and reads nothing", async () => {
    mocks.env.APP_MODE = "demo";

    expect(await loadBookingPanel({ personalAvailable: true })).toEqual({ status: "unavailable", reason: "demo" });
    expect(mocks.links).not.toHaveBeenCalled();
  });

  it("says booking pages need the hosted calendar connection when self-hosting", async () => {
    mocks.env.APP_MODE = "self-hosted";

    expect(await loadBookingPanel({ personalAvailable: true })).toEqual({
      status: "unavailable",
      reason: "selfHosted",
    });
    expect(mocks.links).not.toHaveBeenCalled();
  });

  it("says the plan or the role does not allow booking pages and reads nothing", async () => {
    expect(await loadBookingPanel({ personalAvailable: false })).toEqual({ status: "unavailable", reason: "locked" });
    expect(mocks.links).not.toHaveBeenCalled();
  });

  it("loads the pages with their owners and the setup of the booking modal", async () => {
    const state = await loadBookingPanel({ personalAvailable: true });

    expect(state).toEqual({
      status: "ready",
      links: [expect.objectContaining({ title: "Intro call", ownerName: "Test User", own: true })],
      setup: { calendars: [], lists: [], relationships: [], blockedReason: "noCalendar" },
      busyTimeIncomplete: true,
    });
  });
});
