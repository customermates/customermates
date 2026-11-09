import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl/server", () => ({ getLocale: () => Promise.resolve("en") }));
vi.mock("next/headers", () => ({ headers: () => Promise.reject(new Error("outside a request")) }));

import type { ApiRateLimitRepo, ApiRateLimitWindowKind } from "../api-rate-limit.repo";

import { FREE_PLAN_USAGE_LIMITS } from "@/core/commercial/plan-catalog";
import { ApiRateLimitExceededError } from "@/core/auth/api-rate-limit-exceeded-error";

import { ApiRateLimitService } from "../api-rate-limit.service";
import { IntegrationRequestLimiter } from "../integration-request-limiter";

function memoryRepo() {
  const counts = new Map<string, number>();
  const prune = vi.fn().mockResolvedValue(undefined);
  const repo: ApiRateLimitRepo = {
    incrementWindowsUnscoped: (companyId, windows) =>
      Promise.resolve(
        windows.map(({ window, windowStart }: { window: ApiRateLimitWindowKind; windowStart: Date }) => {
          const key = `${companyId}:${window}:${windowStart.toISOString()}`;
          counts.set(key, (counts.get(key) ?? 0) + 1);
          return { window, count: counts.get(key) ?? 0 };
        }),
      ),
    pruneWindowsUnscoped: prune,
  };
  return { repo, prune };
}

describe("API and MCP rate limit", () => {
  it("allows 10 requests per minute and answers the 11th with the seconds until the next minute", async () => {
    const { repo, prune } = memoryRepo();
    const service = new ApiRateLimitService(repo, () => Promise.resolve(FREE_PLAN_USAGE_LIMITS));
    const now = new Date("2026-11-07T10:00:45.000Z");

    for (let index = 0; index < 10; index++) expect(await service.admit("company", now)).toBeNull();
    expect(await service.admit("company", now)).toEqual({ window: "minute", limit: 10, retryAfterSeconds: 15 });
    expect(await service.admit("company", new Date("2026-11-07T10:01:00.000Z"))).toBeNull();
    expect(prune).toHaveBeenCalledTimes(2);
  });

  it("allows 200 requests per day across minutes", async () => {
    const { repo } = memoryRepo();
    const service = new ApiRateLimitService(repo, () => Promise.resolve(FREE_PLAN_USAGE_LIMITS));
    const start = Date.parse("2026-11-07T00:00:00.000Z");

    for (let index = 0; index < 200; index++)
      expect(await service.admit("company", new Date(start + Math.floor(index / 5) * 60_000))).toBeNull();
    const refused = await service.admit("company", new Date("2026-11-07T23:00:00.000Z"));
    expect(refused).toEqual({ window: "day", limit: 200, retryAfterSeconds: 3_600 });
  });

  it("does not count or limit workspaces without Free limits", async () => {
    const { repo } = memoryRepo();
    const increment = vi.spyOn(repo, "incrementWindowsUnscoped");
    const service = new ApiRateLimitService(repo, () => Promise.resolve(null));

    expect(await service.admit("company")).toBeNull();
    expect(increment).not.toHaveBeenCalled();
  });

  it("counts one HTTP request once even when several interactors resolve the user", async () => {
    const admit = vi.fn().mockResolvedValue(null);
    const request = {};
    const limiter = new IntegrationRequestLimiter({ admit }, () => Promise.resolve(request));

    await limiter.admit("company");
    await limiter.admit("company");

    expect(admit).toHaveBeenCalledOnce();
  });

  it("throws a 429 error that names the limit, the retry time and the Starter upgrade", async () => {
    const limiter = new IntegrationRequestLimiter(
      { admit: () => Promise.resolve({ window: "minute", limit: 10, retryAfterSeconds: 12 }) },
      () => Promise.resolve(null),
    );

    const error = await limiter.admit("company").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiRateLimitExceededError);
    expect((error as ApiRateLimitExceededError).retryAfterSeconds).toBe(12);
    expect((error as ApiRateLimitExceededError).message).toBe(
      "This workspace is on the Free plan, which allows 10 API and MCP requests per minute. Wait and retry, or upgrade to Starter (€12 per user per month) to remove the request limit.",
    );
  });
});
