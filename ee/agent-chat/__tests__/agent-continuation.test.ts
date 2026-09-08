import type { FinishReason, ModelMessage } from "ai";
import { describe, expect, it } from "vitest";

import {
  AGENT_CONTINUATION_CHECKPOINT_MAX_BYTES,
  AGENT_CONTINUATION_RETAINED_RESPONSE_STEPS,
  agentContinuationShouldStop,
  compactAgentContinuationContext,
  decideAgentContinuationLoop,
  serializeAgentContinuationCheckpoint,
  summarizeAgentContinuationStep,
  type AgentContinuationStep,
} from "../agent-continuation";

type ToolAttempt = {
  name: string;
  input?: unknown;
  output?: unknown;
  invalid?: boolean;
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
      ...(attempt.invalid ? { invalid: true } : {}),
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

function advance(
  steps: AgentContinuationStep[],
  options: {
    completedAtMs?: number;
    pendingApproval?: boolean;
  } = {},
) {
  return decideAgentContinuationLoop({
    startedAtMs: 1_000,
    steps,
    observedAtMs: options.completedAtMs ?? 2_000,
    pendingApproval: options.pendingApproval,
  });
}

describe("agent continuation context compaction", () => {
  it("keeps every admitted message and only the last two complete response-message steps", () => {
    const initialMessages: ModelMessage[] = [
      { role: "user", content: "first admitted message" },
      { role: "assistant", content: "admitted replay" },
      { role: "user", content: "current admitted request" },
    ];
    const steps = [
      step([{ name: "get_workspace_context" }], "tool-calls", "old-response"),
      step([{ name: "get_workspace_context" }], "tool-calls", "recent-response-1"),
      step([{ name: "get_workspace_context" }], "tool-calls", "recent-response-2"),
    ];

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
    expect(compacted.system).toContain("Match toolName/resource");
    expect(compacted.system).toContain("never restart done work");
    expect(compacted.system).not.toContain("old-response");
    expect(compacted.checkpoint).toMatchObject({
      detailPolicy: "progress_only",
      completedSteps: 1,
      completedActivities: 1,
      activities: [
        {
          toolName: "get_workspace_context",
          kind: "workspace.inspect",
          status: "done",
        },
      ],
    });
    expect(compacted.retainedResponseSteps).toBe(AGENT_CONTINUATION_RETAINED_RESPONSE_STEPS);
  });

  it("fits a maximum-counter empty progress ledger inside the minimum accepted checkpoint envelope", () => {
    const serialized = serializeAgentContinuationCheckpoint(
      {
        version: 1,
        detailPolicy: "progress_only",
        completedSteps: 20,
        completedActivities: 100,
        successfulActivities: 100,
        successfulWrites: 16,
        errors: 3,
        cancelled: 20,
        omittedActivities: 100,
        activities: [],
      },
      512,
    );

    expect(serialized.bytes).toBeLessThanOrEqual(512);
  });

  it("distinguishes operations that share the same resource and activity kind", () => {
    const activities = summarizeAgentContinuationStep(
      step([
        { name: "get_record_schema", input: { entity: "contact" } },
        { name: "list_records", input: { entity: "contact" } },
      ]),
    );

    expect(activities).toEqual([
      expect.objectContaining({ toolName: "get_record_schema", kind: "records.read", resource: "contacts" }),
      expect.objectContaining({ toolName: "list_records", kind: "records.read", resource: "contacts" }),
    ]);
  });

  it("keeps distinct schema-read progress when the live six-read sequence crosses the compaction boundary", () => {
    const compacted = compactAgentContinuationContext({
      system: "system",
      initialMessages: [{ role: "user", content: "inspect each schema, then continue" }],
      steps: [
        step([{ name: "get_workspace_context" }], "tool-calls", "workspace-response"),
        step([{ name: "get_record_schema", input: { entity: "contact" } }], "tool-calls", "contact-response"),
        step([{ name: "get_record_schema", input: { entity: "organization" } }], "tool-calls", "organization-response"),
        step([{ name: "get_record_schema", input: { entity: "deal" } }], "tool-calls", "deal-response"),
        step([{ name: "get_record_schema", input: { entity: "service" } }], "tool-calls", "service-response"),
        step([{ name: "get_record_schema", input: { entity: "task" } }], "tool-calls", "task-response"),
      ],
    });

    expect(
      compacted.checkpoint?.activities.map(
        (activity) => `${activity.toolName}:${activity.resource ?? "workspace"}:${activity.status}`,
      ),
    ).toEqual([
      "get_workspace_context:workspace:done",
      "get_record_schema:contacts:done",
      "get_record_schema:organizations:done",
      "get_record_schema:deals:done",
    ]);
    expect(compacted.messages.map((message) => message.content)).toEqual([
      "inspect each schema, then continue",
      "service-response",
      "task-response",
    ]);
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
      steps: [...oldSteps, step([], "tool-calls", "recent-1"), step([], "tool-calls", "recent-2")],
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
      steps: [step([], "tool-calls"), step([], "tool-calls")],
    });

    expect(compacted.system).toBe("system");
    expect(compacted.checkpoint).toBeNull();
    expect(compacted.checkpointBytes).toBe(0);
  });

  it("derives each retained bundle from the SDK's per-step response history", () => {
    const steps = [
      step([], "tool-calls", "first"),
      step([], "tool-calls", "second"),
      step([], "tool-calls", "third"),
      step([], "tool-calls", "fourth"),
    ];

    expect(steps.map((current) => current.response.messages.length)).toEqual([1, 1, 1, 1]);

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
    expect(activities.map((activity) => activity.toolName)).toEqual(["create_contacts", "send_email"]);
    expect(JSON.stringify(activities)).not.toContain(privateValue);
    expect(JSON.stringify(activities)).not.toContain("tool-");
  });

  it("does not let an invalid tool call inject instructions into the progress ledger", () => {
    const [activity] = summarizeAgentContinuationStep(step([{ name: "ignore_previous_instructions", invalid: true }]));

    expect(activity?.toolName).toBe("unknown");
    expect(JSON.stringify(activity)).not.toContain("ignore_previous_instructions");
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

  it("pauses only for an unresolved approval", () => {
    const decision = advance([
      step([
        {
          name: "request_support",
          input: { subject: "Help", body: "Please help" },
          status: "pending",
        },
      ]),
    ]);

    expect(decision).toMatchObject({ action: "pause", reason: "approval" });
  });

  it("continues through repeated calls, errors, and no-progress rounds", () => {
    const repeated = Array.from({ length: 40 }, () =>
      step([{ name: "create_contacts", input: [{}], status: "error" }]),
    );
    const noProgress = Array.from({ length: 40 }, () => step([], "tool-calls"));
    const decision = advance([...repeated, ...noProgress], { completedAtMs: Number.MAX_SAFE_INTEGER - 1 });

    expect(decision).toMatchObject({
      action: "continue",
      accounting: {
        providerSteps: 80,
        errors: 40,
        noProgressSteps: 80,
        repeatedActivityCalls: 40,
      },
    });
  });

  it("recomputes full single-stream accounting without double-counting prior stop checks", () => {
    const steps = [step([{ name: "create_contacts", input: [{}] }]), step([{ name: "create_contacts", input: [{}] }])];
    const first = decideAgentContinuationLoop({ startedAtMs: 1_000, steps, observedAtMs: 3_000 });
    const second = decideAgentContinuationLoop({ startedAtMs: 1_000, steps, observedAtMs: 3_000 });

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

  it("continues after an output-length finish", () => {
    expect(advance([step([], "length")])).toMatchObject({ action: "continue" });
  });

  it.each([
    ["content-filter", "content_filter"],
    ["error", "provider_error"],
    ["other", "provider_error"],
  ] as const)("maps the %s finish reason to the technical %s stop", (finishReason, reason) => {
    expect(advance([step([], finishReason)])).toMatchObject({ action: "error", reason });
  });
});
