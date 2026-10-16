import { describe, expect, it } from "vitest";

import { CHECKOUT_PENDING_MS, checkoutPendingSince, checkoutStateOf } from "../checkout-state";

const NOW = new Date("2026-10-16T12:00:00.000Z");

describe("checkoutStateOf", () => {
  it("reports no checkout when none was started", () => {
    expect(checkoutStateOf(null, NOW)).toBe("none");
  });

  it("keeps a checkout pending for fifteen minutes after it started", () => {
    expect(CHECKOUT_PENDING_MS).toBe(15 * 60 * 1000);
    expect(checkoutStateOf(NOW, NOW)).toBe("pending");
    expect(checkoutStateOf(new Date(NOW.getTime() - CHECKOUT_PENDING_MS + 1), NOW)).toBe("pending");
  });

  it("reports a checkout as overdue from the fifteenth minute on", () => {
    expect(checkoutStateOf(new Date(NOW.getTime() - CHECKOUT_PENDING_MS), NOW)).toBe("overdue");
    expect(checkoutStateOf(new Date(NOW.getTime() - 24 * 60 * 60 * 1000), NOW)).toBe("overdue");
  });

  it("treats a start stamped slightly ahead of this server's clock as pending", () => {
    expect(checkoutStateOf(new Date(NOW.getTime() + 2_000), NOW)).toBe("pending");
  });
});

describe("checkoutPendingSince", () => {
  it("returns the oldest start that still counts as pending", () => {
    const since = checkoutPendingSince(NOW);

    expect(since).toEqual(new Date("2026-10-16T11:45:00.000Z"));
    expect(checkoutStateOf(since, NOW)).toBe("overdue");
    expect(checkoutStateOf(new Date(since.getTime() + 1), NOW)).toBe("pending");
  });
});
