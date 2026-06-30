import crypto from "node:crypto";

import type { RunCodeReport } from "./sandbox.types";

/**
 * Transient registry for BACKGROUND run_code executions. A background run is started
 * (status "running"), executed fire-and-forget, and its report is written here when
 * it finishes; the agent (or user) polls it by id via the check_run tool. Mirrors the
 * artifact/upload stores: in-memory, globalThis-pinned, tenant-scoped, short TTL.
 *
 * PROD CAVEAT: the fire-and-forget execution and this store live in ONE Node process.
 * On a persistent server (dev / self-hosted) the run keeps executing in the event loop
 * after the agent's response closes and updates this map. On a freeze-after-response
 * serverless host (e.g. Vercel) the background work may be killed before it finishes —
 * a durable queue/worker + shared store (Redis/S3) is needed there (same class of
 * caveat as artifact-store; see task #27).
 */
export type SandboxRun = {
  status: "running" | "done" | "error";
  report?: RunCodeReport;
  error?: string;
  companyId: string;
  userId: string;
  startedAt: number;
  finishedAt?: number;
  expiresAt: number;
};

const TTL_MS = 60 * 60 * 1000; // 1h
const MAX_RUNS = 500;

const globalRef = globalThis as unknown as { __sandboxRuns?: Map<string, SandboxRun> };
const store: Map<string, SandboxRun> = (globalRef.__sandboxRuns ??= new Map());

function sweep(): void {
  const now = Date.now();
  for (const [id, r] of store) if (now > r.expiresAt) store.delete(id);
  if (store.size > MAX_RUNS) {
    const overflow = store.size - MAX_RUNS;
    let i = 0;
    for (const id of store.keys()) {
      if (i++ >= overflow) break;
      store.delete(id);
    }
  }
}

/** Register a new background run (status "running") and return its id. */
export function createRun(input: { companyId: string; userId: string }): string {
  sweep();
  const id = crypto.randomUUID();
  const now = Date.now();
  store.set(id, {
    status: "running",
    companyId: input.companyId,
    userId: input.userId,
    startedAt: now,
    expiresAt: now + TTL_MS,
  });
  return id;
}

/** Mark a run finished with its report (internal; called by the background task). */
export function completeRun(id: string, report: RunCodeReport): void {
  const r = store.get(id);
  if (!r) return;
  r.status = "done";
  r.report = report;
  r.finishedAt = Date.now();
}

/** Mark a run failed (internal; called by the background task). */
export function failRun(id: string, message: string): void {
  const r = store.get(id);
  if (!r) return;
  r.status = "error";
  r.error = message;
  r.finishedAt = Date.now();
}

/** Returns the run only if it exists, is unexpired, and belongs to companyId. */
export function getRun(id: string, companyId: string): SandboxRun | null {
  const r = store.get(id);
  if (!r) return null;
  if (Date.now() > r.expiresAt) {
    store.delete(id);
    return null;
  }
  if (r.companyId !== companyId) return null;
  return r;
}
