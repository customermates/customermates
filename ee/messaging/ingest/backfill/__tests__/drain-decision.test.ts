import { describe, expect, it } from "vitest";

import { GIVE_UP_RATE_LIMIT_SECONDS, MAX_PAGE_STALL_RETRIES, decideSource, leavesWorkUndone } from "../drain-decision";

const page = (over: Partial<Parameters<typeof decideSource>[0]> = {}) => ({
  nextCursor: null,
  done: true,
  ...over,
});

describe("a source the account cannot read", () => {
  it("is skipped, and does not count as work left undone", () => {
    const decision = decideSource(page({ forbidden: true }), 0);

    expect(decision.action).toBe("skip");
    expect(leavesWorkUndone(decision)).toBe(false);
  });
});

describe("a long Retry-After", () => {
  it("defers that source rather than ending the account's drain", () => {
    const decision = decideSource(page({ done: false, retryAfterSeconds: 52005 }), 0);

    expect(decision.action).toBe("defer");
    expect(decision).toMatchObject({ retryAfterSeconds: 52005 });
  });

  it("counts as work left undone, so the account is not reported fully synced", () => {
    expect(leavesWorkUndone(decideSource(page({ retryAfterSeconds: 52005 }), 0))).toBe(true);
  });

  it("is judged on the threshold, not on the source being first", () => {
    expect(decideSource(page({ retryAfterSeconds: GIVE_UP_RATE_LIMIT_SECONDS + 1 }), 0).action).toBe("defer");
    expect(decideSource(page({ retryAfterSeconds: GIVE_UP_RATE_LIMIT_SECONDS }), 0).action).toBe("advance");
  });
});

describe("a short Retry-After", () => {
  it("waits and keeps going rather than deferring", () => {
    const decision = decideSource(page({ done: false, retryAfterSeconds: 30 }), 0);

    expect(decision).toEqual({ action: "advance", delayMs: 30_000, done: false });
    expect(leavesWorkUndone(decision)).toBe(false);
  });
});

describe("a stalled page", () => {
  it("retries while under the cap", () => {
    const decision = decideSource(page({ stalled: true }), 0);

    expect(decision.action).toBe("retry");
    expect(leavesWorkUndone(decision)).toBe(false);
  });

  it("is abandoned once the cap is passed, and counts as undone", () => {
    const decision = decideSource(page({ stalled: true }), MAX_PAGE_STALL_RETRIES);

    expect(decision.action).toBe("abandon");
    expect(leavesWorkUndone(decision)).toBe(true);
  });

  it("allows exactly the configured number of retries", () => {
    expect(decideSource(page({ stalled: true }), MAX_PAGE_STALL_RETRIES - 1).action).toBe("retry");
    expect(decideSource(page({ stalled: true }), MAX_PAGE_STALL_RETRIES).action).toBe("abandon");
  });
});

describe("an ordinary page", () => {
  it("advances with no delay and reports whether the source is finished", () => {
    expect(decideSource(page({ done: false }), 0)).toEqual({ action: "advance", delayMs: 0, done: false });
    expect(decideSource(page({ done: true }), 0)).toEqual({ action: "advance", delayMs: 0, done: true });
  });
});

describe("precedence between conditions", () => {
  it("treats a forbidden source as forbidden even when the provider also throttled", () => {
    expect(decideSource(page({ forbidden: true, retryAfterSeconds: 52005 }), 0).action).toBe("skip");
  });

  it("treats a stall as a stall even when a retry-after rides along", () => {
    expect(decideSource(page({ stalled: true, retryAfterSeconds: 52005 }), 0).action).toBe("retry");
  });
});
