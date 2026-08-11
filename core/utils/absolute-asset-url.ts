import { env } from "@/env";

const SAME_ORIGIN_ASSET_FIELDS = new Set(["avatarUrl"]);

function isSameOriginPath(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//");
}

function absolutize(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.map(absolutize);

  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    result[key] =
      SAME_ORIGIN_ASSET_FIELDS.has(key) && isSameOriginPath(item) ? `${env.BASE_URL}${item}` : absolutize(item);
  }

  return result;
}

export function withAbsoluteAssetUrls<T>(payload: T): T {
  return absolutize(payload) as T;
}
