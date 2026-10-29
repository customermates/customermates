import "server-only";

import { createHash } from "node:crypto";

import type { ErrorReport } from "./error-report";

const DEFAULT_DAILY_LIMIT = 10;

const claims = new Map<string, Set<string>>();

export function errorNotificationDailyLimit(): number {
  const value = process.env.ERROR_REPORTING_NOTIFICATION_DAILY_LIMIT?.trim();
  if (!value) return DEFAULT_DAILY_LIMIT;
  const limit = Number(value);
  return Number.isSafeInteger(limit) && limit >= 0 ? limit : DEFAULT_DAILY_LIMIT;
}

function normalizedMessage(message: string): string {
  return message
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<id>")
    .replace(/\b[0-9a-f]*\d[0-9a-f]*\b/gi, "#")
    .slice(0, 300);
}

export function errorFingerprint(report: Pick<ErrorReport, "source" | "name" | "message" | "frames">): string {
  const frame = report.frames.findLast((candidate) => !candidate.file.includes("node_modules")) ?? report.frames.at(-1);
  return createHash("sha256")
    .update(
      JSON.stringify([report.source, report.name, normalizedMessage(report.message), frame?.file, frame?.function]),
    )
    .digest("hex")
    .slice(0, 32);
}

export function errorNotificationDay(report: Pick<ErrorReport, "timestamp">): string {
  return new Date(report.timestamp * 1000).toISOString().slice(0, 10);
}

export function claimErrorNotification(report: ErrorReport): string | null {
  const limit = errorNotificationDailyLimit();
  if (limit === 0) return null;
  const day = errorNotificationDay(report);
  const fingerprint = errorFingerprint(report);
  for (const key of claims.keys()) if (key !== day) claims.delete(key);
  const claimed = claims.get(day) ?? new Set<string>();
  claims.set(day, claimed);
  if (claimed.has(fingerprint) || claimed.size >= limit) return null;
  claimed.add(fingerprint);
  return fingerprint;
}

export function resetErrorNotificationClaims(): void {
  claims.clear();
}
