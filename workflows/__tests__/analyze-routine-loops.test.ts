import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  replaceFindings: vi.fn(),
}));

vi.mock("@/core/di", () => ({
  getRecordRoutineRiskFindingsInteractor: () => ({
    invoke: state.replaceFindings,
  }),
}));
vi.mock("../capture-failure", () => ({
  reportFailure: vi.fn().mockResolvedValue(undefined),
  toWorkflowFailure: (error: unknown) => error,
}));

import { analyzeRoutineLoops } from "../analyze-routine-loops";

beforeEach(() => {
  state.replaceFindings.mockReset().mockResolvedValue(undefined);
});

describe("analyze routine loops", () => {
  it("only clears stale company findings", async () => {
    await analyzeRoutineLoops({ companyId: "company-1" });

    expect(state.replaceFindings).toHaveBeenCalledWith({
      companyId: "company-1",
      findings: [],
    });
  });
});
