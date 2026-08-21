import type { FinishReason, ModelMessage } from "ai";
import { describe, expect, it } from "vitest";

import {
  AGENT_CONTINUATION_CHECKPOINT_MAX_BYTES,
  AGENT_CONTINUATION_RETAINED_RESPONSE_STEPS,
  agentContinuationShouldStop,
  compactAgentContinuationContext,
  decideAgentContinuationLoop,
  summarizeAgentContinuationStep,
  type AgentContinuationLimits,
  type AgentContinuationStep,
} from "../agent-continuation";
import { AGENT_CONTEXT_ACCUMULATION_STEPS } from "../agent-budget-policy";

type ToolAttempt = {
  name: string;
  input?: unknown;
  output?: unknown;
  status?: "done" | "error" | "cancelled" | "pending";
};

let nextToolId = 0;

function step(
  attempts: ToolAttempt[] = [],
  finishReason: FinishReason = "tool-calls",
  responseText = `response-${nextToolId}`,
): AgentContinuationStep {
  const content: unknown[] = [];
  for (const attempt of attempts) {
    const toolCallId = `tool-${++nextToolId}`;
    const toolCall = {
      type: "tool-call",
      toolCallId,
      toolName: attempt.name,
      input: attempt.input ?? {},
    };
    content.push(toolCall);
    if (attempt.status === "pending") {
      content.push({
        type: "tool-approval-request",
        approvalId: `approval-${toolCallId}`,
        toolCall,
      });
    } else if (attempt.status === "error") {
      content.push({
        type: "tool-error",
        toolCallId,
        toolName: attempt.name,
        error: new Error("failed"),
      });
    } else {
      content.push({
        type: "tool-result",
        toolCallId,
        toolName: attempt.name,
        output:
          attempt.status === "cancelled"
            ? {
                agentToolStatus: "cancelled",
                reason: "rejected",
                message: "not run",
              }
            : (attempt.output ?? { ok: true, result: "done" }),
      });
    }
  }

  return {
    finishReason,
    content,
    response: { messages: [{ role: "assistant", content: responseText }] },
  };
}

function hostedToolSearchStep(): AgentContinuationStep {
  const searchCall = {
    type: "tool-call",
    toolCallId: "search-call",
    toolName: "discover_customermates_tools",
    input: { paths: ["records.lookup"] },
    providerOptions: { openai: { itemId: "tsc-catalog" } },
  };
  const searchResult = {
    type: "tool-result",
    toolCallId: "search-call",
    toolName: "discover_customermates_tools",
    output: {
      type: "json",
      value: { tools: [{ schema: "large-provider-owned-definition" }] },
    },
    providerOptions: { openai: { itemId: "tso-catalog" } },
  };
  const assistantMessage = {
    role: "assistant",
    content: [
      searchCall,
      searchResult,
      {
        type: "tool-call",
        toolCallId: "client-call",
        toolName: "list_records",
        input: { entity: "contact" },
      },
    ],
  } as unknown as ModelMessage;
  const clientResultMessage = {
    role: "tool",
    content: [
      {
        type: "tool-result",
        toolCallId: "client-call",
        toolName: "list_records",
        output: { ok: true, result: "private old result" },
      },
    ],
  } as unknown as ModelMessage;

  return {
    finishReason: "tool-calls",
    content: [searchCall, searchResult],
    response: { messages: [assistantMessage, clientResultMessage] },
  };
}

function withCumulativeResponseMessages(steps: AgentContinuationStep[]) {
  const messages: ModelMessage[] = [];
  return steps.map((current) => {
    messages.push(...current.response.messages);
    return {
      ...current,
      response: { messages: [...messages] },
    };
  });
}

const limits: AgentContinuationLimits = {
  maxProviderSteps: 20,
  maxWriteActivities: 40,
  maxErrors: 4,
  maxNoProgressSteps: 2,
  maxRepeatedActivityCalls: 4,
  maxWallTimeMs: 240_000,
};

function advance(
  steps: AgentContinuationStep[],
  overrides: Partial<AgentContinuationLimits> = {},
  options: {
    completedAtMs?: number;
    pendingApproval?: boolean;
  } = {},
) {
  return decideAgentContinuationLoop(
    {
      startedAtMs: 1_000,
      steps,
      observedAtMs: options.completedAtMs ?? 2_000,
      pendingApproval: options.pendingApproval,
    },
    { ...limits, ...overrides },
  );
}

describe("agent continuation context compaction", () => {
  it("keeps every admitted message and only the last two complete response-message steps", () => {
    const initialMessages: ModelMessage[] = [
      { role: "user", content: "first admitted message" },
      { role: "assistant", content: "admitted replay" },
      { role: "user", content: "current admitted request" },
    ];
    const steps = withCumulativeResponseMessages([
      step([{ name: "get_workspace_context" }], "tool-calls", "old-response"),
      step([{ name: "get_workspace_context" }], "tool-calls", "recent-response-1"),
      step([{ name: "get_workspace_context" }], "tool-calls", "recent-response-2"),
    ]);

    const compacted = compactAgentContinuationContext({
      system: "stable system prompt",
      initialMessages,
      steps,
    });

    expect(compacted.messages.slice(0, initialMessages.length)).toEqual(initialMessages);
    expect(compacted.messages.map((message) => message.content)).toEqual([
      "first admitted message",
      "admitted replay",
      "current admitted request",
      "recent-response-1",
      "recent-response-2",
    ]);
    expect(compacted.system).toContain("stable system prompt");
    expect(compacted.system).toContain("re-read with an available read tool");
    expect(compacted.system).not.toContain("old-response");
    expect(compacted.checkpoint).toMatchObject({
      detailPolicy: "reread_required",
      completedSteps: 1,
      completedActivities: 1,
    });
    expect(compacted.retainedResponseSteps).toBe(AGENT_CONTINUATION_RETAINED_RESPONSE_STEPS);
    expect(AGENT_CONTEXT_ACCUMULATION_STEPS).toBe(AGENT_CONTINUATION_RETAINED_RESPONSE_STEPS + 1);
  });

  it("serializes only bounded semantic descriptors and hard-caps the whole checkpoint at 4 KiB", () => {
    const privateValue = "sk-private-never-persist";
    const oldSteps = Array.from({ length: 18 }, (_, stepIndex) =>
      step(
        Array.from({ length: 8 }, () => ({
          name: "request_support",
          input: {
            apiKey: privateValue,
            subject: `${privateValue}-${stepIndex}`,
            body: privateValue.repeat(50),
          },
          output: { ok: true, result: privateValue.repeat(50) },
        })),
        "tool-calls",
        privateValue.repeat(50),
      ),
    );
    const compacted = compactAgentContinuationContext({
      system: "system",
      initialMessages: [{ role: "user", content: "safe request" }],
      steps: withCumulativeResponseMessages([
        ...oldSteps,
        step([], "tool-calls", "recent-1"),
        step([], "tool-calls", "recent-2"),
      ]),
      checkpointMaxBytes: AGENT_CONTINUATION_CHECKPOINT_MAX_BYTES,
    });

    expect(compacted.checkpointBytes).toBeLessThanOrEqual(AGENT_CONTINUATION_CHECKPOINT_MAX_BYTES);
    expect(new TextEncoder().encode(compacted.system.slice("system\n\n".length)).byteLength).toBe(
      compacted.checkpointBytes,
    );
    expect(compacted.system).not.toContain(privateValue);
    expect(JSON.stringify(compacted.checkpoint)).not.toContain(privateValue);
    expect(compacted.checkpoint?.omittedActivities).toBeGreaterThan(0);
    expect(compacted.checkpoint?.activities.every((activity) => activity.action === "support.request")).toBe(true);
  });

  it("does not add a checkpoint before an older step actually exists", () => {
    const initialMessages: ModelMessage[] = [{ role: "user", content: "request" }];
    const compacted = compactAgentContinuationContext({
      system: "system",
      initialMessages,
      steps: withCumulativeResponseMessages([step([], "tool-calls"), step([], "tool-calls")]),
    });

    expect(compacted.system).toBe("system");
    expect(compacted.checkpoint).toBeNull();
    expect(compacted.checkpointBytes).toBe(0);
  });

  it("preserves exact older hosted tool-search response bundles for deferred definitions", () => {
    const hostedSearch = hostedToolSearchStep();
    const compacted = compactAgentContinuationContext({
      system: "system",
      initialMessages: [{ role: "user", content: "request" }],
      steps: withCumulativeResponseMessages([
        hostedSearch,
        step([], "tool-calls", "recent-1"),
        step([], "tool-calls", "recent-2"),
      ]),
    });

    expect(compacted.retainedToolSearchResponseSteps).toBe(1);
    expect(compacted.messages[1]).not.toBe(hostedSearch.response.messages[0]);
    expect((compacted.messages[1]?.content as unknown[])[0]).toBe(
      (hostedSearch.response.messages[0]?.content as unknown[])[0],
    );
    expect((compacted.messages[1]?.content as unknown[])[1]).toBe(
      (hostedSearch.response.messages[0]?.content as unknown[])[1],
    );
    expect(JSON.stringify(compacted.messages[1])).toContain("tsc-catalog");
    expect(JSON.stringify(compacted.messages[1])).toContain("tso-catalog");
    expect(JSON.stringify(compacted.messages)).not.toContain("client-call");
    expect(JSON.stringify(compacted.messages)).not.toContain("private old result");
    expect(compacted.checkpoint).toMatchObject({
      completedSteps: 1,
      completedActivities: 0,
    });
  });

  it("derives each retained bundle from the SDK's cumulative response history", () => {
    const steps = withCumulativeResponseMessages([
      step([], "tool-calls", "first"),
      step([], "tool-calls", "second"),
      step([], "tool-calls", "third"),
      step([], "tool-calls", "fourth"),
    ]);

    expect(steps.map((current) => current.response.messages.length)).toEqual([1, 2, 3, 4]);

    const compacted = compactAgentContinuationContext({
      system: "system",
      initialMessages: [{ role: "user", content: "request" }],
      steps,
    });

    expect(compacted.messages.map((message) => message.content)).toEqual(["request", "third", "fourth"]);
  });

  it("classifies structured failures and cancellations without retaining their result bodies or ids", () => {
    const privateValue = "private-result";
    const activities = summarizeAgentContinuationStep(
      step([
        {
          name: "create_contacts",
          input: [{ firstName: privateValue }],
          output: { ok: false, result: privateValue },
        },
        {
          name: "send_email",
          input: { to: privateValue },
          status: "cancelled",
        },
      ]),
    );

    expect(activities.map((activity) => activity.status)).toEqual(["error", "cancelled"]);
    expect(JSON.stringify(activities)).not.toContain(privateValue);
    expect(JSON.stringify(activities)).not.toContain("tool-");
  });
});

describe("agent continuation decisions", () => {
  it("continues an incomplete segment that made bounded progress", () => {
    const decision = advance([step([{ name: "get_workspace_context" }])]);

    expect(decision).toMatchObject({
      action: "continue",
      accounting: { providerSteps: 1, noProgressSteps: 0 },
    });
    expect(agentContinuationShouldStop(decision)).toBe(false);
  });

  it("completes when the model naturally stops", () => {
    const decision = advance([step([], "stop")]);

    expect(decision.action).toBe("complete");
    expect(agentContinuationShouldStop(decision)).toBe(true);
  });

  it("pauses for approval before applying ordinary continuation limits", () => {
    const decision = advance(
      [
        step([
          {
            name: "request_support",
            input: { subject: "Help", body: "Please help" },
            status: "pending",
          },
        ]),
      ],
      { maxProviderSteps: 1 },
    );

    expect(decision).toMatchObject({ action: "pause", reason: "approval" });
  });

  it("stops after consecutive steps with no successful activity", () => {
    const noProgress = step([], "tool-calls");
    const decision = advance([noProgress, noProgress], {
      maxNoProgressSteps: 2,
    });

    expect(decision).toMatchObject({ action: "error", reason: "no_progress" });
  });

  it("treats hosted tool discovery as progress even though it is intentionally absent from the checkpoint", () => {
    const decision = advance([hostedToolSearchStep()]);

    expect(decision).toMatchObject({
      action: "continue",
      accounting: { noProgressSteps: 0, errors: 0 },
    });
  });

  it("stops a repeated semantic call even when opaque tool-call ids differ", () => {
    const decision = advance(
      [step([{ name: "get_workspace_context" }, { name: "get_workspace_context" }, { name: "get_workspace_context" }])],
      { maxRepeatedActivityCalls: 3 },
    );

    expect(decision).toMatchObject({
      action: "error",
      reason: "repeated_activity",
    });
  });

  it("does not confuse distinct calls that share the same safe activity descriptor", () => {
    const decision = advance(
      [
        step([
          {
            name: "manage_custom_columns",
            input: { action: "upsert", entity: "contact", label: "Region" },
          },
          {
            name: "manage_custom_columns",
            input: { action: "upsert", entity: "contact", label: "Source" },
          },
          {
            name: "manage_custom_columns",
            input: { action: "upsert", entity: "contact", label: "Tier" },
          },
          {
            name: "manage_custom_columns",
            input: { action: "upsert", entity: "contact", label: "Owner" },
          },
        ]),
      ],
      { maxRepeatedActivityCalls: 3 },
    );

    expect(decision).toMatchObject({
      action: "continue",
      accounting: { repeatedActivityCalls: 1 },
    });
  });

  it("stops at the structured tool-error limit", () => {
    const decision = advance(
      [
        step([
          { name: "create_contacts", input: [{}], status: "error" },
          { name: "create_organizations", input: [{}], status: "error" },
        ]),
      ],
      { maxErrors: 2, maxNoProgressSteps: 10 },
    );

    expect(decision).toMatchObject({ action: "error", reason: "error_limit" });
  });

  it.each([
    {
      name: "wall time",
      steps: [step([{ name: "get_workspace_context" }])],
      overrides: { maxWallTimeMs: 1_000 },
      options: { completedAtMs: 2_000 },
      reason: "wall_time_limit",
    },
    {
      name: "provider steps",
      steps: [step([{ name: "get_workspace_context" }]), step([{ name: "get_workspace_context" }])],
      overrides: { maxProviderSteps: 2 },
      options: {},
      reason: "step_limit",
    },
    {
      name: "writes",
      steps: [step([{ name: "create_contacts", input: [{}] }])],
      overrides: { maxWriteActivities: 1 },
      options: {},
      reason: "write_limit",
    },
  ])("stops at the overall $name limit", ({ steps, overrides, options, reason }) => {
    expect(advance(steps, overrides, options)).toMatchObject({
      action: "error",
      reason,
    });
  });

  it("recomputes full single-stream accounting without double-counting prior stop checks", () => {
    const steps = [step([{ name: "create_contacts", input: [{}] }]), step([{ name: "create_contacts", input: [{}] }])];
    const first = decideAgentContinuationLoop({ startedAtMs: 1_000, steps, observedAtMs: 3_000 }, limits);
    const second = decideAgentContinuationLoop({ startedAtMs: 1_000, steps, observedAtMs: 3_000 }, limits);

    expect(first.accounting).toEqual(second.accounting);
    expect(first).toMatchObject({
      action: "continue",
      accounting: {
        providerSteps: 2,
        writeActivities: 2,
        repeatedActivityCalls: 2,
      },
    });
  });

  it.each([
    ["length", "length"],
    ["content-filter", "content_filter"],
    ["error", "provider_error"],
    ["other", "provider_error"],
  ] as const)("maps the %s finish reason to a bounded %s error", (finishReason, reason) => {
    expect(advance([step([], finishReason)], { maxNoProgressSteps: 10 })).toMatchObject({
      action: "error",
      reason,
    });
  });
});
