import { describe, expect, it } from "vitest";
import { shouldResumeAgentStreamFailure, shouldRetryAgentStreamFailure } from "../agent-stream-retry";

describe("agent stream retry", () => {
  const transient = new Error('Step "doStreamStep" exceeded max retries (0 retries)');

  it("retries a failed model stream before any tool has run, within the budget", () => {
    expect(
      shouldRetryAgentStreamFailure(transient, 0, 2, { appliedRounds: 0, completedTools: 0, approvedCalls: 0 }),
    ).toBe(true);
    expect(
      shouldRetryAgentStreamFailure(transient, 2, 2, { appliedRounds: 0, completedTools: 0, approvedCalls: 0 }),
    ).toBe(false);
  });

  it("never retries a segment after a write or approval may have run", () => {
    expect(
      shouldRetryAgentStreamFailure(transient, 0, 2, { appliedRounds: 1, completedTools: 0, approvedCalls: 0 }),
    ).toBe(false);
    expect(
      shouldRetryAgentStreamFailure(transient, 0, 2, { appliedRounds: 0, completedTools: 1, approvedCalls: 0 }),
    ).toBe(false);
    expect(
      shouldRetryAgentStreamFailure(transient, 0, 2, { appliedRounds: 0, completedTools: 0, approvedCalls: 1 }),
    ).toBe(false);
    expect(
      shouldRetryAgentStreamFailure(new Error("a write failed"), 0, 2, {
        appliedRounds: 0,
        completedTools: 0,
        approvedCalls: 0,
      }),
    ).toBe(false);
  });

  it("resumes from completed steps after an interrupted provider round without an approval", () => {
    expect(shouldResumeAgentStreamFailure(transient, 0, 2, 20, 0)).toBe(true);
    expect(shouldResumeAgentStreamFailure(transient, 2, 2, 20, 0)).toBe(false);
    expect(shouldResumeAgentStreamFailure(transient, 0, 2, 0, 0)).toBe(false);
    expect(shouldResumeAgentStreamFailure(transient, 0, 2, 20, 1)).toBe(false);
    expect(shouldResumeAgentStreamFailure(new Error("tool failed"), 0, 2, 20, 0)).toBe(false);
  });
});
