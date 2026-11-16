import { describe, expect, it } from "vitest";

import { BOOKING_MAX_DURATION_MINUTES } from "../booking.schema";
import { MEETING_DURATION_MINUTES } from "../meeting-durations";
import { MEETING_MAX_MINUTES, MEETING_MIN_MINUTES } from "../meeting.schema";

describe("meeting duration choices", () => {
  it("are ascending and unique", () => {
    expect([...MEETING_DURATION_MINUTES]).toEqual([...new Set(MEETING_DURATION_MINUTES)].sort((a, b) => a - b));
  });

  it("stay inside what a meeting and a booking link accept", () => {
    for (const minutes of MEETING_DURATION_MINUTES) {
      expect(minutes).toBeGreaterThanOrEqual(MEETING_MIN_MINUTES);
      expect(minutes).toBeLessThanOrEqual(Math.min(MEETING_MAX_MINUTES, BOOKING_MAX_DURATION_MINUTES));
    }
  });

  it("include the default length of a new meeting", () => {
    expect(MEETING_DURATION_MINUTES).toContain(30);
  });
});
