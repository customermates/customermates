const API_RATE_LIMIT_EXCEEDED_BRAND = Symbol.for("customermates.apiRateLimitExceeded");

export type ApiRateLimitWindow = "minute" | "day";

export type ApiRateLimitUpgrade = { plan: string; price: string; url: string };

function groupedNumber(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function retryText(window: ApiRateLimitWindow, retryAfterSeconds: number): string {
  if (window === "minute") return `Retry in ${Math.max(1, retryAfterSeconds)} seconds.`;
  const hours = Math.max(1, Math.ceil(retryAfterSeconds / 3600));
  return `The daily limit resets in about ${hours} ${hours === 1 ? "hour" : "hours"}.`;
}

export function apiRateLimitMessage(
  window: ApiRateLimitWindow,
  limit: number,
  retryAfterSeconds: number,
  upgrade: ApiRateLimitUpgrade,
) {
  const scope = window === "minute" ? "per minute" : "per day";
  return [
    `This Customermates workspace is on the Free plan, which allows ${groupedNumber(limit)} API and MCP requests ${scope}, and that limit is reached. ${retryText(window, retryAfterSeconds)}`,
    `Tell the user that the Free plan is for trying Customermates and limits how much an AI agent or integration can do. ${upgrade.plan} (${upgrade.price} per user per month) removes the request limit for the API and MCP and adds teams, Mate, routines and webhooks.`,
    `A workspace admin can upgrade here: ${upgrade.url}`,
  ].join(" ");
}

export class ApiRateLimitExceededError extends Error {
  constructor(
    public readonly window: ApiRateLimitWindow,
    public readonly limit: number,
    public readonly retryAfterSeconds: number,
    public readonly upgrade: ApiRateLimitUpgrade,
  ) {
    super(apiRateLimitMessage(window, limit, retryAfterSeconds, upgrade));
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
