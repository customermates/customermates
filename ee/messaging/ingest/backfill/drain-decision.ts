export const CATCHUP_DELAY_MS = 10_000;
export const GIVE_UP_RATE_LIMIT_SECONDS = 600;
export const MAX_PAGE_STALL_RETRIES = 4;

export type DrainPage = {
  nextCursor: string | null;
  done: boolean;
  retryAfterSeconds?: number;
  stalled?: boolean;
  forbidden?: boolean;
};

export type DrainDecision =
  | { action: "skip"; reason: "forbidden" }
  | { action: "abandon"; reason: "stalled"; afterAttempts: number }
  | { action: "defer"; retryAfterSeconds: number }
  | { action: "retry"; delayMs: number }
  | { action: "advance"; delayMs: number; done: boolean };

export function decideSource(page: DrainPage, stallCount: number): DrainDecision {
  if (page.forbidden) return { action: "skip", reason: "forbidden" };

  if (page.stalled) {
    const attempts = stallCount + 1;

    return attempts > MAX_PAGE_STALL_RETRIES
      ? { action: "abandon", reason: "stalled", afterAttempts: MAX_PAGE_STALL_RETRIES }
      : { action: "retry", delayMs: CATCHUP_DELAY_MS };
  }

  const retryAfterSeconds = page.retryAfterSeconds ?? 0;
  if (retryAfterSeconds > GIVE_UP_RATE_LIMIT_SECONDS) return { action: "defer", retryAfterSeconds };

  return {
    action: "advance",
    delayMs: retryAfterSeconds ? retryAfterSeconds * 1000 : 0,
    done: page.done,
  };
}

export function leavesWorkUndone(decision: DrainDecision): boolean {
  return decision.action === "abandon" || decision.action === "defer";
}
