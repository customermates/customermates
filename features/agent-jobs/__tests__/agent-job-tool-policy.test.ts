import { describe, expect, it } from "vitest";

import {
  AGENT_JOB_UNTRUSTED_REFUSAL,
  AGENT_JOB_WIKI_REFUSAL,
  agentJobToolPolicyRefusal,
  isAgentJobOutwardCall,
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

  it("does not trip over input that is no object", () => {
    for (const input of [undefined, null, "text", ["create"]]) {
      expect(agentJobToolPolicyRefusal("manage_routines", input, untrusted)).toBeNull();
      expect(agentJobToolPolicyRefusal("send_email", input, untrusted)).toBe(AGENT_JOB_UNTRUSTED_REFUSAL);
    }
  });
});
