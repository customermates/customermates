import { describe, expect, it } from "vitest";

import {
  areAgentTurnAffectedResources,
  decideAgentTurnAdmission,
  isAgentTurnTerminalError,
  isAgentTurnTerminalCode,
  terminalAgentTurnStatus,
  type AgentTurnRequestSnapshot,
} from "../agent-turn-request";

const turn: AgentTurnRequestSnapshot = {
  id: "turn-1",
  conversationId: "conversation-1",
  clientRequestId: "request-1",
  text: "Create a contact",
  pageRoute: "/en/contacts",
  status: "running",
  runId: "run-1",
  attemptCount: 1,
  providerStartedAt: null,
  userMessageId: "user-message-1",
  assistantMessageId: null,
  terminalCode: null,
  affectedResources: [],
  hasLaterMessages: false,
};

const input = {
  clientRequestId: turn.clientRequestId,
  conversationId: turn.conversationId,
  text: turn.text,
  pageRoute: turn.pageRoute,
  retry: false,
};

describe("agent turn request admission", () => {
  it("admits a new client request exactly once", () => {
    expect(decideAgentTurnAdmission(null, input)).toEqual({
      disposition: "new",
    });
    expect(decideAgentTurnAdmission(null, { ...input, retry: true })).toEqual({
      disposition: "conflict",
    });
  });

  it.each(["text", "pageRoute", "conversationId"] as const)(
    "rejects reuse of a client key with different %s",
    (field) => {
      expect(
        decideAgentTurnAdmission(turn, {
          ...input,
          [field]: `${input[field]}-different`,
        }),
      ).toEqual({ disposition: "conflict" });
    },
  );

  it.each(["running", "completed", "failed", "uncertain"] as const)(
    "never treats a duplicate %s turn as a new run",
    (status) => {
      expect(
        decideAgentTurnAdmission(
          {
            ...turn,
            status,
            assistantMessageId: status === "completed" ? "assistant-message-1" : null,
          },
          input,
        ).disposition,
      ).toBe(status);
    },
  );

  it("fails closed when a completed row is missing its canonical assistant message", () => {
    expect(
      decideAgentTurnAdmission({ ...turn, status: "completed", assistantMessageId: null }, input).disposition,
    ).toBe("uncertain");
  });

  it("only retries a proven pre-provider failure after an explicit retry", () => {
    expect(decideAgentTurnAdmission({ ...turn, status: "failed" }, { ...input, retry: true }).disposition).toBe(
      "retry",
    );
    expect(
      decideAgentTurnAdmission({ ...turn, status: "failed", hasLaterMessages: true }, { ...input, retry: true }),
    ).toEqual({ disposition: "conflict" });
  });

  it.each([
    {
      providerStartedAt: new Date("2026-08-06T10:00:00.000Z"),
      assistantMessageId: null,
    },
    { providerStartedAt: null, assistantMessageId: "assistant-message-1" },
  ])("fails closed when a failed row contains provider or canonical-output evidence", (evidence) => {
    expect(
      decideAgentTurnAdmission({ ...turn, ...evidence, status: "failed" }, { ...input, retry: true }).disposition,
    ).toBe("uncertain");
  });

  it("binds an omitted conversation id to the stored request without weakening other payload checks", () => {
    expect(decideAgentTurnAdmission(turn, { ...input, conversationId: undefined }).disposition).toBe("running");
    expect(
      decideAgentTurnAdmission(turn, {
        ...input,
        conversationId: undefined,
        pageRoute: "/en/tasks",
      }),
    ).toEqual({
      disposition: "conflict",
    });
  });
});

describe("agent turn terminal classification", () => {
  it("prefers a canonical replayable transcript even after provider execution", () => {
    expect(
      terminalAgentTurnStatus({
        canonicalTranscriptPersisted: true,
        providerStarted: true,
      }),
    ).toBe("completed");
  });

  it("fails closed when provider execution may have started without a canonical transcript", () => {
    expect(
      terminalAgentTurnStatus({
        canonicalTranscriptPersisted: false,
        providerStarted: true,
      }),
    ).toBe("uncertain");
  });

  it("allows retry only when failure happened before provider execution", () => {
    expect(
      terminalAgentTurnStatus({
        canonicalTranscriptPersisted: false,
        providerStarted: false,
      }),
    ).toBe("failed");
  });

  it("accepts only renderable terminal codes and known resource names", () => {
    expect(isAgentTurnTerminalCode("completed")).toBe(true);
    expect(isAgentTurnTerminalCode("arbitrary-provider-code")).toBe(false);
    expect(areAgentTurnAffectedResources(["contacts", "widgets"])).toBe(true);
    expect(areAgentTurnAffectedResources(["contacts", "contacts"])).toBe(false);
    expect(areAgentTurnAffectedResources(["contacts", "private-table"])).toBe(false);
  });

  it("uses one live-and-replay error classification for every terminal code", () => {
    expect(isAgentTurnTerminalError("completed")).toBe(false);
    expect((["partial", "error", "cancelled", "policyBreach"] as const).every(isAgentTurnTerminalError)).toBe(true);
  });
});
