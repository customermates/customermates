import "server-only";

import { createHash } from "node:crypto";

import { logRuntimeEvent } from "@/core/utils/audit-log";

import type { ErrorReport } from "./error-report";

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

export function publishServerError(report: ErrorReport): void {
  logRuntimeEvent({ ...report, fingerprint: errorFingerprint(report) });
}
