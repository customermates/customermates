import { describe, expect, it } from "vitest";

import {
  AGENT_CONTEXT_OMITTED_NOTE,
  agentContextDegradationLadder,
  agentHistoryOmittedNote,
  degradedAgentReplayMessages,
} from "../agent-context-degradation";
import { agentAdmissionContextBytes } from "../agent-provider-context";

const prefix = '<page_context route="/en/dashboard"/>\n<selected_context kind="widget" widgetId="w-1"/>\n';
const messages = [
  { role: "user", text: "First question" },
  { role: "assistant", text: "First answer" },
  { role: "user", text: `${prefix}Add a revenue widget` },
];

describe("agentContextDegradationLadder", () => {
  it("drops history sets before requested sets, then history oldest first, then the attached context", () => {
    expect(
      agentContextDegradationLadder({
        messages,
        toolsets: ["widgets", "messaging", "not-a-set"],
        requestToolsets: ["widgets"],
      }),
    ).toEqual([
      { toolsets: ["widgets"], omittedHistory: 0, contextOmitted: false },
      { toolsets: [], omittedHistory: 0, contextOmitted: false },
      { toolsets: [], omittedHistory: 1, contextOmitted: false },
      { toolsets: [], omittedHistory: 2, contextOmitted: false },
      { toolsets: [], omittedHistory: 2, contextOmitted: true },
    ]);
  });

  it("skips the request-only level when an older payload carries no request sets", () => {
    expect(agentContextDegradationLadder({ messages: [{ role: "user", text: "Hello" }], toolsets: ["views"] })).toEqual(
      [{ toolsets: [], omittedHistory: 0, contextOmitted: false }],
    );
  });

  it("has nothing left to drop for a lone request without attached context", () => {
    expect(agentContextDegradationLadder({ messages: [{ role: "user", text: "Hello" }], toolsets: [] })).toEqual([]);
  });
});

describe("degradedAgentReplayMessages", () => {
  it("omits the oldest history and says so without touching the current request", () => {
    expect(degradedAgentReplayMessages(messages, { toolsets: [], omittedHistory: 1, contextOmitted: false })).toEqual([
      { role: "assistant", text: "First answer" },
      { role: "user", text: `${agentHistoryOmittedNote(1)}${prefix}Add a revenue widget` },
    ]);
  });

  it("replaces only the attached context lines with a marker", () => {
    expect(degradedAgentReplayMessages(messages, { toolsets: [], omittedHistory: 2, contextOmitted: true })).toEqual([
      {
        role: "user",
        text: `${agentHistoryOmittedNote(2)}${AGENT_CONTEXT_OMITTED_NOTE}Add a revenue widget`,
      },
    ]);
  });

  it("keeps a request without attached context unchanged", () => {
    const plain = [{ role: "user", text: 'Hello\n<page_context route="/x"/>' }];
    expect(degradedAgentReplayMessages(plain, { toolsets: [], omittedHistory: 0, contextOmitted: true })).toEqual(
      plain,
    );
  });
});

describe("agentAdmissionContextBytes", () => {
  it("admits the measured context when it fits", () => {
    expect(
      agentAdmissionContextBytes({ fullContextBytes: 900, minimalContextBytes: 500, maxContextBytes: 1_000 }),
    ).toBe(900);
  });

  it("reserves the whole context envelope when only the degraded context fits", () => {
    expect(
      agentAdmissionContextBytes({ fullContextBytes: 1_500, minimalContextBytes: 500, maxContextBytes: 1_000 }),
    ).toBe(1_000);
  });

  it("keeps rejecting a request whose minimal context cannot fit", () => {
    expect(
      agentAdmissionContextBytes({ fullContextBytes: 1_500, minimalContextBytes: 1_200, maxContextBytes: 1_000 }),
    ).toBe(1_500);
    expect(
      agentAdmissionContextBytes({ fullContextBytes: null, minimalContextBytes: 500, maxContextBytes: 1_000 }),
    ).toBe(null);
  });
});
