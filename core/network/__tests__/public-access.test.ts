import { describe, expect, it } from "vitest";

import { admitAll } from "../public-access";
import { TokenBucketRateLimiter } from "../token-bucket-rate-limiter";

describe("admitAll", () => {
  it("admits when every limiter has room and skips keys that are null", () => {
    const strict = new TokenBucketRateLimiter(1, 60_000);

    expect(admitAll([[strict, null]])).toBeNull();
    expect(admitAll([[strict, null]])).toBeNull();
    expect(admitAll([[new TokenBucketRateLimiter(5, 60_000), "a"]])).toBeNull();
  });

  it("answers rateLimited with the wait of the first limiter that refuses", () => {
    const first = new TokenBucketRateLimiter(1, 60_000);
    const second = new TokenBucketRateLimiter(1, 120_000);

    expect(
      admitAll([
        [first, "a"],
        [second, "a"],
      ]),
    ).toBeNull();
    expect(
      admitAll([
        [first, "a"],
        [second, "a"],
      ]),
    ).toEqual({ status: "rateLimited", retryAfterSeconds: 60 });
  });

  it("does not charge the later limiters once an earlier one refuses", () => {
    const first = new TokenBucketRateLimiter(1, 60_000);
    const second = new TokenBucketRateLimiter(2, 60_000);

    admitAll([
      [first, "a"],
      [second, "a"],
    ]);
    admitAll([
      [first, "a"],
      [second, "a"],
    ]);

    expect(admitAll([[second, "a"]])).toBeNull();
    expect(admitAll([[second, "a"]])).toEqual({ status: "rateLimited", retryAfterSeconds: expect.any(Number) });
  });
});
