import { describe, expect, it } from "vitest";

import { comparePaired, costPerSuccessfulTask, holmAdjust, passAtLeastK, percentile, uniformlyFailingChecks } from "../stats";

const episode = (arm: string, caseId: string, repetition: number, passed: boolean, usd = 0.01) => ({ arm, caseId, repetition, passed, usd, judge: null });

describe("benchmark statistics", () => {
  it("computes pass^k per case over the first k repetitions", () => {
    const outcomes = [
      episode("a", "S1", 1, true),
      episode("a", "S1", 2, true),
      episode("a", "S1", 3, false),
      episode("a", "S2", 1, true),
      episode("a", "S2", 2, true),
      episode("a", "S2", 3, true),
    ];
    expect(passAtLeastK(outcomes, 2)).toBe(1);
    expect(passAtLeastK(outcomes, 3)).toBe(0.5);
  });

  it("orders repetitions before pass^k and reports insufficient repetitions", () => {
    const outcomes = [
      episode("a", "S1", 3, false),
      episode("a", "S1", 1, true),
      episode("a", "S1", 2, true),
    ];
    expect(passAtLeastK(outcomes, 2)).toBe(1);
    expect(passAtLeastK(outcomes, 4)).toBeNull();
  });

  it("prices cost per successful task and refuses to divide by zero successes", () => {
    expect(costPerSuccessfulTask([episode("a", "S1", 1, true, 0.02), episode("a", "S2", 1, false, 0.04)])).toBeCloseTo(0.06, 9);
    expect(costPerSuccessfulTask([episode("a", "S1", 1, false, 0.02)])).toBeNull();
  });

  it("reports the exact sign-test floor for a paired comparison", () => {
    const control = ["S1", "S2", "S3", "S4"].map((caseId) => episode("c", caseId, 1, false));
    const candidate = ["S1", "S2", "S3", "S4"].map((caseId) => episode("x", caseId, 1, true));
    const comparison = comparePaired(candidate, control);
    expect(comparison).toMatchObject({ cases: 4, wins: 4, losses: 0, ties: 0, floor: 0.125 });
    expect(comparison.signTestP).toBeCloseTo(0.125, 6);
  });

  it("applies the Holm step-down correction monotonically", () => {
    const adjusted = holmAdjust([
      { key: "a", p: 0.01 },
      { key: "b", p: 0.04 },
      { key: "c", p: 0.03 },
    ]);
    expect(adjusted.get("a")).toBeCloseTo(0.03, 6);
    expect(adjusted.get("c")).toBeCloseTo(0.06, 6);
    expect(adjusted.get("b")).toBeCloseTo(0.06, 6);
  });

  it("lists checks that never passed anywhere so the oracle gets audited before the ranking", () => {
    const checks = [
      [{ id: "always-fails", passed: false }, { id: "varies", passed: true }],
      [{ id: "always-fails", passed: false }, { id: "varies", passed: false }],
      [{ id: "always-fails", passed: false }, { id: "varies", passed: true }],
    ];
    expect(uniformlyFailingChecks(checks)).toEqual(["always-fails"]);
  });

  it("takes percentiles from a sorted copy", () => {
    expect(percentile([5, 1, 3], 50)).toBe(3);
    expect(percentile([], 50)).toBeNull();
  });
});
