import { describe, expect, it } from "vitest";

import {
  AGENT_JOB_ROUTINE_LOOP_REFUSAL,
  AGENT_JOB_UNTRUSTED_REFUSAL,
  AGENT_JOB_WIKI_REFUSAL,
  agentJobToolPolicyRefusal,
  isAgentJobOutwardCall,
  isAgentJobRoutineLoopCall,
} from "../agent-job-tool-policy";

const trusted = { untrusted: false, ruleChain: [] };
const untrusted = { untrusted: true, ruleChain: [] };

const OUTWARD: Array<[string, unknown]> = [
  ["send_email", { to: "someone" }],
  ["send_chat_message", { text: "hello" }],
  ["manage_webhooks", { action: "create" }],
  ["manage_webhooks", { action: "update" }],
  ["manage_routines", { action: "create" }],
  ["manage_routines", { action: "update" }],
  ["manage_routines", { action: "run_now" }],
  ["manage_social_relations", { action: "invite" }],
];

const INWARD: Array<[string, unknown]> = [
  ["query_crm_records", { typeId: "t" }],
  ["mutate_crm_record", { action: "update" }],
  ["save_message_draft", { text: "draft" }],
  ["manage_webhooks", { action: "list" }],
  ["manage_webhooks", { action: "list_deliveries" }],
  ["manage_routines", { action: "list" }],
  ["manage_routines", { action: "runs" }],
  ["manage_routines", { action: "pause" }],
  ["manage_social_relations", { action: "list" }],
  ["manage_social_relations", { action: "accept" }],
  ["manage_wiki_pages", { action: "search" }],
  ["manage_wiki_pages", { action: "get" }],
];

describe("what an agent job may call", () => {
  it.each(OUTWARD)("refuses %s %j for an untrusted job and allows it for a trusted one", (name, input) => {
    expect(isAgentJobOutwardCall(name, input)).toBe(true);
    expect(agentJobToolPolicyRefusal(name, input, untrusted)).toBe(AGENT_JOB_UNTRUSTED_REFUSAL);
    expect(agentJobToolPolicyRefusal(name, input, trusted)).toBeNull();
  });

  it.each(INWARD)("allows %s %j also for an untrusted job", (name, input) => {
    expect(isAgentJobOutwardCall(name, input)).toBe(false);
    expect(agentJobToolPolicyRefusal(name, input, untrusted)).toBeNull();
  });

  it.each(["create", "update", "delete"])("always refuses the Knowledge Base action %s", (action) => {
    expect(agentJobToolPolicyRefusal("manage_wiki_pages", { action }, trusted)).toBe(AGENT_JOB_WIKI_REFUSAL);
    expect(agentJobToolPolicyRefusal("manage_wiki_pages", { action }, untrusted)).toBe(AGENT_JOB_WIKI_REFUSAL);
  });

  describe("when a rule started the job", () => {
    const RULE = "00000000-0000-4000-8000-0000000000a1";
    const fromRule = { untrusted: false, ruleChain: [RULE] };
    const routines = (input: unknown, context = fromRule) =>
      agentJobToolPolicyRefusal("manage_routines", input, context);

    it("refuses to start a routine and to create or update one that reacts to events", () => {
      for (const input of [
        { action: "run_now", id: "r" },
        { action: "create", triggerKind: "event", triggerEvents: ["record.updated"] },
        { action: "create", triggerKind: "schedule", recordSources: [{ typeId: "t" }] },
        { action: "create", recordTrigger: { typeId: "t" } },
        { action: "update", id: "r", triggerKind: "event" },
        { action: "update", id: "r", triggerEvents: ["record.created"] },
        { action: "update", id: "r", prompt: "Write the record again" },
        { action: "update", id: "r", enabled: true },
      ])
        expect(routines(input)).toBe(AGENT_JOB_ROUTINE_LOOP_REFUSAL);
    });

    it("still lets the job read routines, pause one and keep a scheduled routine", () => {
      for (const input of [
        { action: "list" },
        { action: "runs", id: "r" },
        { action: "pause", id: "r" },
        { action: "create", triggerKind: "schedule", cronExpression: "0 9 * * 1", triggerEvents: [] },
        { action: "update", id: "r", triggerKind: "schedule", prompt: "New text" },
      ])
        expect(routines(input)).toBeNull();
      expect(agentJobToolPolicyRefusal("manage_rules", { action: "list" }, fromRule)).toBeNull();
    });

    it("does not apply outside a rule chain, and the untrusted refusal comes first", () => {
      expect(isAgentJobRoutineLoopCall("manage_routines", { action: "run_now" })).toBe(true);
      expect(routines({ action: "run_now", id: "r" }, trusted)).toBeNull();
      expect(routines({ action: "run_now", id: "r" }, { untrusted: true, ruleChain: [RULE] })).toBe(
        AGENT_JOB_UNTRUSTED_REFUSAL,
      );
    });
  });

  it("does not trip over input that is no object", () => {
    for (const input of [undefined, null, "text", ["create"]]) {
      expect(agentJobToolPolicyRefusal("manage_routines", input, untrusted)).toBeNull();
      expect(agentJobToolPolicyRefusal("send_email", input, untrusted)).toBe(AGENT_JOB_UNTRUSTED_REFUSAL);
    }
  });
});
