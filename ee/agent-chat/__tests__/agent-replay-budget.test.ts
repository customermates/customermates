import { describe, expect, it } from "vitest";

import {
  AGENT_REPLAY_COUNT,
  AGENT_REPLAY_HISTORY_MAX_BYTES,
  AGENT_REPLAY_MIN_MESSAGE_BYTES,
  agentReplayWorstCaseMessageChars,
  budgetAgentReplayHistory,
  clampAgentReplayText,
  serializedReplayTextBytes,
} from "../agent-replay-budget";

const prior = (text: string, role = "user") => ({ role, text, budgeted: true });
const current = (text: string) => ({ role: "user", text, budgeted: false });

describe("agent replay budget", () => {
  it("keeps the admission estimate byte-identical to the previous per-message cap", () => {
    expect(agentReplayWorstCaseMessageChars()).toBe(1_200);
  });

  it("never spends more than the shared allowance, whatever it is given", () => {
    const messages = Array.from({ length: AGENT_REPLAY_COUNT - 1 }, () => prior("x".repeat(50_000)));
    const spent = budgetAgentReplayHistory(messages).reduce(
      (total, text) => total + serializedReplayTextBytes(text),
      0,
    );
    expect(spent).toBeLessThanOrEqual(AGENT_REPLAY_HISTORY_MAX_BYTES);
  });

  it("preserves the end of a long brief, which is where binding constraints sit", () => {
    const brief = `${"filler ".repeat(1_000)}The ceiling is EUR 24,000 and paid advertising is excluded.`;
    const [replayed] = budgetAgentReplayHistory([prior(brief)]);
    expect(replayed).toContain("The ceiling is EUR 24,000 and paid advertising is excluded.");
    expect(replayed).toContain("filler");
  });

  it("leaves a message that fits completely untouched", () => {
    const short = "Use the Aster proposal.";
    expect(budgetAgentReplayHistory([prior(short)])).toEqual([short]);
  });

  it("never truncates the current message", () => {
    const huge = "y".repeat(40_000);
    const [, currentText] = budgetAgentReplayHistory([prior("x".repeat(40_000)), current(huge)]);
    expect(currentText).toBe(huge);
  });

  it("gives every prior message at least a floor rather than dropping it entirely", () => {
    const messages = Array.from({ length: AGENT_REPLAY_COUNT - 1 }, (_, index) =>
      prior(`${index} `.repeat(4_000), index % 2 === 0 ? "user" : "assistant"),
    );
    for (const text of budgetAgentReplayHistory(messages))
      expect(serializedReplayTextBytes(text)).toBeGreaterThanOrEqual(AGENT_REPLAY_MIN_MESSAGE_BYTES / 2);
  });

  it("does not let a verbose assistant reply crowd out the user's own words", () => {
    const userBrief = `${"u".repeat(6_000)}BINDING_RULE`;
    const [replayedUser] = budgetAgentReplayHistory([prior(userBrief), prior("a".repeat(30_000), "assistant")]);
    expect(replayedUser).toContain("BINDING_RULE");
  });

  it("never splits a surrogate pair when it cuts", () => {
    const emoji = "👍".repeat(2_000);
    const clamped = clampAgentReplayText(emoji, 400);
    expect(clamped).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
    expect(clamped).not.toMatch(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/);
  });

  it("counts serialized bytes, not code units, so multibyte text is budgeted honestly", () => {
    expect(serializedReplayTextBytes("a")).toBe(1);
    expect(serializedReplayTextBytes("ä")).toBe(2);
    expect(serializedReplayTextBytes("👍")).toBe(4);
    expect(serializedReplayTextBytes('"')).toBe(2);
    expect(serializedReplayTextBytes("\n")).toBe(2);
  });
});
