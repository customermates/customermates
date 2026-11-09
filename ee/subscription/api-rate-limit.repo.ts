export type ApiRateLimitWindowKind = "minute" | "day";

export type ApiRateLimitCount = { window: ApiRateLimitWindowKind; count: number };

export abstract class ApiRateLimitRepo {
  abstract incrementWindowsUnscoped(
    companyId: string,
    windows: Array<{ window: ApiRateLimitWindowKind; windowStart: Date }>,
  ): Promise<ApiRateLimitCount[]>;
  abstract pruneWindowsUnscoped(companyId: string, before: Date): Promise<void>;
}
