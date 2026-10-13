import { describe, expect, it } from "vitest";

import { agentTurnFailureMessageKind } from "../agent-failure-message";

describe("agent turn failure copy", () => {
  it("names provider-budget compaction instead of a generic retry", () => {
    expect(agentTurnFailureMessageKind("Agent context could not be compacted within its provider budget.", null)).toBe(
      "contextLimit",
    );
  });

  it("names a broken model stream instead of a generic retry", () => {
    expect(agentTurnFailureMessageKind('Step "doStreamStep" exceeded max retries (0 retries)', null)).toBe(
      "streamInterrupted",
    );
  });

  it("keeps an actionable tool failure ahead of the stream failure", () => {
    expect(agentTurnFailureMessageKind("doStreamStep", "The record was not found")).toBe("turnError");
  });
});
