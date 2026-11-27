import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockUser } from "@/tests/helpers/mock-user";
import { MOCK_ENV_MODULE, MOCK_ZOD_MODULE, createMockDiModule } from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();

const spies = vi.hoisted(() => ({ updateMeeting: vi.fn() }));

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/core/di", () => ({
  ...createMockDiModule(() => mockUser),
  getUpdateMeetingInteractor: () => ({ invoke: spies.updateMeeting }),
}));

import { scheduleMeetingTool } from "../calendar-write.mcp-tools";

const EVENT_ID = "f028e950-af9d-4389-a72c-f497a0d79d8d";
const MEETING = {
  id: EVENT_ID,
  calendarId: "49c87c51-d414-4a52-b4d7-77ab4b650b72",
  title: "Onboarding call",
  description: null,
  location: null,
  conferenceUrl: null,
  startsAt: "2026-11-27T14:00:00.000Z",
  endsAt: "2026-11-27T14:45:00.000Z",
  timeZone: "Europe/Berlin",
  status: "confirmed",
  attendees: [],
  records: [],
  followUp: null,
  warnings: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  spies.updateMeeting.mockResolvedValue({ ok: true, data: MEETING });
});

describe("schedule_meeting update", () => {
  it("moves an existing event by id with a start and an end and returns the provider's readback", async () => {
    const result = await scheduleMeetingTool.execute({
      action: "update",
      id: EVENT_ID,
      startsAt: "2026-11-27T15:00:00+01:00",
      endsAt: "2026-11-27T15:45:00+01:00",
      title: "Onboarding call",
    });

    expect(spies.updateMeeting).toHaveBeenCalledExactlyOnceWith({
      id: EVENT_ID,
      startsAt: "2026-11-27T15:00:00+01:00",
      endsAt: "2026-11-27T15:45:00+01:00",
      title: "Onboarding call",
      sendInvites: true,
    });
    const structured = (result as { structuredContent?: unknown }).structuredContent;
    expect(structured).toEqual({ action: "update", meeting: MEETING });
    expect(scheduleMeetingTool.outputSchema.safeParse(structured).success).toBe(true);
  });

  it("documents moving synced events created outside Customermates", () => {
    expect(scheduleMeetingTool.description).toContain("also when it was created outside Customermates");
    expect(scheduleMeetingTool.inputSchema.shape.endsAt).toBeDefined();
  });
});
