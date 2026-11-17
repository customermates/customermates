import { describe, expect, it } from "vitest";

import { addDaysToIso, dateOfIso, isoDateOf } from "../notification-pause-dates";

describe("notification pause dates", () => {
  it("writes and reads the local calendar day without a time zone shift", () => {
    expect(isoDateOf(new Date(2026, 10, 17, 23, 59))).toBe("2026-11-17");
    expect(isoDateOf(dateOfIso("2026-01-05"))).toBe("2026-01-05");
    expect(addDaysToIso("2026-11-28", 7)).toBe("2026-12-05");
    expect(addDaysToIso("2026-12-30", 3)).toBe("2027-01-02");
  });
});
