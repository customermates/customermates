import type { PlanUsageLimits } from "@/core/commercial/plan-catalog";
import type { ApiRateLimitRepo } from "./api-rate-limit.repo";

export type ApiRateLimitRefusal = {
  window: "minute" | "day";
  limit: number;
  retryAfterSeconds: number;
};

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

function windowStart(now: Date, size: number): Date {
  return new Date(Math.floor(now.getTime() / size) * size);
}

export function apiDayWindowStart(now: Date = new Date()): Date {
  return windowStart(now, DAY_MS);
}

export class ApiRateLimitService {
  constructor(
    private readonly repo: ApiRateLimitRepo,
    private readonly limits: (companyId: string) => Promise<PlanUsageLimits | null>,
  ) {}

  async admit(companyId: string, now: Date = new Date()): Promise<ApiRateLimitRefusal | null> {
    const limits = await this.limits(companyId);
    if (!limits) return null;
    const minute = windowStart(now, MINUTE_MS);
    const day = windowStart(now, DAY_MS);
    const counts = await this.repo.incrementWindowsUnscoped(companyId, [
      { window: "minute", windowStart: minute },
      { window: "day", windowStart: day },
    ]);
    const count = (window: "minute" | "day") => counts.find((entry) => entry.window === window)?.count ?? 0;
    if (count("minute") === 1) await this.repo.pruneWindowsUnscoped(companyId, new Date(day.getTime() - DAY_MS));
    if (count("day") > limits.apiRequestsPerDay) {
      return {
        window: "day",
        limit: limits.apiRequestsPerDay,
        retryAfterSeconds: Math.max(1, Math.ceil((day.getTime() + DAY_MS - now.getTime()) / 1000)),
      };
    }
    if (count("minute") > limits.apiRequestsPerMinute) {
      return {
        window: "minute",
        limit: limits.apiRequestsPerMinute,
        retryAfterSeconds: Math.max(1, Math.ceil((minute.getTime() + MINUTE_MS - now.getTime()) / 1000)),
      };
    }
    return null;
  }
}
