import { describe, expect, it } from "vitest";

import type { AgentTurnClassifierTrace } from "@/ee/agent-chat/agent-classifier-trace";

import { episodeClassifierSummary, turnAccountingBalanced } from "../episode";

const trace = (overrides: Partial<AgentTurnClassifierTrace> = {}): AgentTurnClassifierTrace => ({
  auxiliaryCostMicrocents: 1_900,
  auxiliaryMeasured: true,
  docsRerank: { model: "jev", calls: 1, answered: 1, costMicrocents: 1_900, measured: true },
  ...overrides,
});

const balancedTurn = (costMicrocents: string, classifierTrace: AgentTurnClassifierTrace | null) => ({
  rounds: [
    { roundIndex: 0, costMicrocents: 10_000n },
    { roundIndex: 1, costMicrocents: 5_000n },
  ],
  usage: [{ state: "settled", costSource: "measured", costMicrocents }],
  terminal: { numTurns: 2, terminalCode: "completed" },
  terminalCode: "completed",
  classifierTrace,
});

describe("benchmark episode classifier evidence", () => {
  it("balances a measured turn only when its charge equals the rounds plus the classifier cost", () => {
    expect(turnAccountingBalanced(balancedTurn("15000", null))).toBe(true);
    expect(turnAccountingBalanced(balancedTurn("16900", trace()))).toBe(true);
    expect(turnAccountingBalanced(balancedTurn("15000", trace()))).toBe(false);
    expect(turnAccountingBalanced({ ...balancedTurn("16900", trace()), terminal: { numTurns: 3, terminalCode: "completed" } })).toBe(false);
  });

  it("summarises whether docs re-rank fired and what it cost", () => {
    expect(
      episodeClassifierSummary([
        trace(),
        null,
        trace({ docsRerank: { model: "jev", calls: 2, answered: 0, costMicrocents: 800, measured: false }, auxiliaryCostMicrocents: 800, auxiliaryMeasured: false }),
      ]),
    ).toEqual({
      docsRerankCalls: 3,
      docsRerankAnswered: 1,
      docsRerankFired: true,
      costMicrocents: 2_700,
      measured: false,
    });
    expect(episodeClassifierSummary([null, undefined])).toMatchObject({
      docsRerankFired: false,
      costMicrocents: 0,
      measured: true,
    });
  });
});
