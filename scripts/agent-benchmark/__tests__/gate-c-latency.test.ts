import { describe, expect, it } from "vitest";

import type { GuardLiveDetails } from "../guard-live-cases";

import { LATENCY, percentile, percentileDiff, summariseGateC } from "../classifier-eval/heldout-live/gate-c-latency";

const details = (over: Partial<GuardLiveDetails>): GuardLiveDetails => ({
  kind: "guard-live",
  itemId: "x",
  written: [],
  intended: [],
  forbidden: [],
  exactPrefix: [],
  wrongRecordWrite: false,
  wrongRecordWriteExcludingExactPrefix: false,
  intendedWritten: [],
  correctWrite: false,
  otherWrite: false,
  unintendedWrite: false,
  asked: false,
  guardRefusals: 0,
  approvals: 0,
  ...over,
});

describe("Gate C and latency analysis", () => {
  it("pools the seven dangerous and three allow cases and bounds a zero count", () => {
    const rows = [
      ...Array.from({ length: 30 }, () => ({ caseId: "GC01", details: details({ asked: true }) })),
      { caseId: "GC06", details: details({ intended: ["atlas-q4"], wrongRecordWrite: true, wrongRecordWriteExcludingExactPrefix: true }) },
      { caseId: "GC08", details: details({ intended: ["nova", "nova-2025"], intendedWritten: ["nova"], guardRefusals: 1 }) },
    ];
    const summary = summariseGateC(rows);
    expect(summary.dangerousCases).toEqual(["GC01", "GC02", "GC03", "GC04", "GC05", "GC06", "GC07"]);
    expect(summary.perCase.GC01).toMatchObject({ item: "en-04", episodes: 30, wrongRecordWrites: { count: 0, upper95OneSided: 9.5 }, asks: { count: 30 } });
    expect(summary.pooledDangerous.wrongRecordWrites).toMatchObject({ count: 1, of: 31 });
    expect(summary.pooledAllow).toMatchObject({ partialWrites: { count: 1 }, falseBlocks: { count: 1 } });
  });

  it("fixes the ABAB order and takes the p95 difference on paired episodes", () => {
    expect(LATENCY.order).toEqual(["off", "docs-v2-jev", "off", "docs-v2-jev", "off", "docs-v2-jev", "off", "docs-v2-jev"]);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20], 95)).toBe(19);
    const unit = (ms: number) => ({ caseId: "c", repetition: 1, firstOutputMs: ms, round0Ms: ms, wallMs: ms, pass: null });
    const pairs = Array.from({ length: 20 }, (_, i) => ({ caseId: `DH${i}`, repetition: 1, control: unit(1000 + 100 * i), candidate: unit(1400 + 100 * i) }));
    expect(percentileDiff(pairs, "firstOutputMs", 95)).toMatchObject({ pairs: 20, controlS: 2.8, candidateS: 3.2, diffS: { point: 0.4 } });
  });
});
