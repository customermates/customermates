const API_RATE_LIMIT_EXCEEDED_BRAND = Symbol.for("customermates.apiRateLimitExceeded");

export type ApiRateLimitWindow = "minute" | "day";

export function apiRateLimitMessage(
  window: ApiRateLimitWindow,
  limit: number,
  upgrade: { plan: string; price: string },
) {
  const scope = window === "minute" ? "per minute" : "per day";
  return `This workspace is on the Free plan, which allows ${String(limit).replace(/\B(?=(\d{3})+(?!\d))/g, ",")} API and MCP requests ${scope}. Wait and retry, or upgrade to ${upgrade.plan} (${upgrade.price} per user per month) to remove the request limit.`;
}

export class ApiRateLimitExceededError extends Error {
  constructor(
    public readonly window: ApiRateLimitWindow,
    public readonly limit: number,
    public readonly retryAfterSeconds: number,
    upgrade: { plan: string; price: string },
  ) {
    super(apiRateLimitMessage(window, limit, upgrade));
    this.name = "ApiRateLimitExceededError";
    (this as Record<symbol, unknown>)[API_RATE_LIMIT_EXCEEDED_BRAND] = true;
  }

  static [Symbol.hasInstance](value: unknown): value is ApiRateLimitExceededError {
    return (
      typeof value === "object" &&
      value !== null &&
      (value as Record<symbol, unknown>)[API_RATE_LIMIT_EXCEEDED_BRAND] === true
    );
  }
}
