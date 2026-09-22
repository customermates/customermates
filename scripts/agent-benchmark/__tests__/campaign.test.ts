import { describe, expect, it } from "vitest";

import { armById } from "../arms";
import { admissionDecision, worstCaseEpisodeUsd } from "../campaign";

describe("benchmark campaign cap", () => {
  it("refuses an episode whose worst case would cross the cap and admits one that fits", () => {
    expect(admissionDecision({ capUsd: 200, spentUsd: 199.5, worstCaseUsd: 1 })).toEqual({ admitted: false, headroomUsd: 0.5 });
    expect(admissionDecision({ capUsd: 200, spentUsd: 10, worstCaseUsd: 1 })).toEqual({ admitted: true, headroomUsd: 190 });
  });

  it("prices the worst case from the runtime's own reservation, per prompt", () => {
    const single = worstCaseEpisodeUsd(armById("shipped"), 1);
    expect(single).toBeGreaterThan(0);
    expect(worstCaseEpisodeUsd(armById("shipped"), 2)).toBeCloseTo(single * 2, 9);
  });
});
