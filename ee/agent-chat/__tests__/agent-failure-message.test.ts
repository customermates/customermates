import { describe, expect, it } from "vitest";

import { agentTurnFailureMessageKind, terminalAgentToolFailureMessage } from "../agent-failure-message";

describe("agent turn failure copy", () => {
  it("names provider-budget compaction instead of a generic retry", () => {
    expect(agentTurnFailureMessageKind("Agent context could not be compacted within its provider budget.")).toBe(
      "contextLimit",
    );
  });

  it("names a broken model stream instead of a generic retry", () => {
    expect(agentTurnFailureMessageKind('Step "doStreamStep" exceeded max retries (0 retries)')).toBe(
      "streamInterrupted",
    );
  });

  it("attributes an interrupted stream after a recovered validation error to the stream", () => {
    const terminal = 'Step "doStreamStep" exceeded max retries (0 retries)';
    expect(agentTurnFailureMessageKind(terminal)).toBe("streamInterrupted");
    expect(terminalAgentToolFailureMessage(terminal, "Validation error at includeRelationships")).toBeNull();
  });

  it("keeps a recovered tool failure out of a later context-limit message", () => {
    const terminal = "Agent context could not be compacted within its provider budget.";
    expect(agentTurnFailureMessageKind(terminal)).toBe("contextLimit");
    expect(terminalAgentToolFailureMessage(terminal, "The record was not found")).toBeNull();
  });

  it("names a tool failure only when it is the terminal error", () => {
    expect(terminalAgentToolFailureMessage("The record was not found", "The record was not found")).toBe(
      "The record was not found",
    );
  });
});
