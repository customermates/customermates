import { describe, expect, it, vi } from "vitest";

import { MOCK_ENV_MODULE, MOCK_PRISMA_DB_MODULE, MOCK_ZOD_MODULE } from "@/tests/helpers/interactor-test-setup";

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);

import { AGENT_JOB_UNTRUSTED_REFUSAL, AGENT_JOB_WIKI_REFUSAL } from "@/features/agent-jobs/agent-job-tool-policy";

import {
  AGENT_JOB_TOOL_LIMIT_REFUSAL,
  AGENT_JOB_UNATTENDED_REFUSAL,
  agentJobToolRefusal,
} from "../agent-job-tool-gate";

import { COMPANY_ID, JOB_ID } from "./agent-runner-fixtures";

const RULE = "00000000-0000-4000-8000-0000000000a1";
const job = { keyId: "key-1", companyId: COMPANY_ID, jobId: JOB_ID, ruleChain: [RULE] };

function gate(options: { untrusted: boolean; counted?: boolean }) {
  const count = vi.fn().mockResolvedValue(options.counted ?? true);
  const isUntrusted = vi.fn().mockResolvedValue(options.untrusted);
  const ask = async (name: string, input: unknown = {}, annotations?: Record<string, boolean>) => {
    const refused = await agentJobToolRefusal(job, { name, annotations }, input, count, isUntrusted);
    return refused ? refused.result : null;
  };
  return { ask, count, isUntrusted };
}

describe("the gate of a job key", () => {
  it("refuses the tools that act outward or change automation for an untrusted job", async () => {
    const { ask, isUntrusted } = gate({ untrusted: true });

    for (const [name, input] of [
      ["send_email", {}],
      ["send_chat_message", {}],
      ["manage_webhooks", { action: "create" }],
      ["manage_webhooks", { action: "update" }],
      ["manage_routines", { action: "create" }],
      ["manage_routines", { action: "update" }],
      ["manage_routines", { action: "run_now" }],
      ["manage_social_relations", { action: "invite" }],
    ] as const)
      expect(await ask(name, input)).toContain(AGENT_JOB_UNTRUSTED_REFUSAL);
    expect(isUntrusted).toHaveBeenCalledWith(job);
  });

  it("lets a trusted job send and reads the job only for a call on that list", async () => {
    const { ask, isUntrusted } = gate({ untrusted: false });

    expect(await ask("send_email")).toBeNull();
    expect(await ask("manage_webhooks", { action: "create" })).toBeNull();
    expect(isUntrusted).toHaveBeenCalledTimes(2);

    isUntrusted.mockClear();
    expect(await ask("query_crm_records", {}, { readOnlyHint: true })).toBeNull();
    expect(await ask("manage_webhooks", { action: "list" })).toBeNull();
    expect(await ask("save_message_draft")).toBeNull();
    expect(isUntrusted).not.toHaveBeenCalled();
  });

  it("always refuses to create, update or delete a Knowledge Base page, and still lets the job read it", async () => {
    for (const untrusted of [false, true]) {
      const { ask } = gate({ untrusted });
      for (const action of ["create", "update", "delete"])
        expect(await ask("manage_wiki_pages", { action })).toContain(AGENT_JOB_WIKI_REFUSAL);
      expect(await ask("manage_wiki_pages", { action: "search" })).toBeNull();
    }
  });

  it("keeps the tool call limit first and the approval rule last", async () => {
    const spent = gate({ untrusted: true, counted: false });
    expect(await spent.ask("send_email")).toContain(AGENT_JOB_TOOL_LIMIT_REFUSAL);
    expect(spent.isUntrusted).not.toHaveBeenCalled();

    const { ask } = gate({ untrusted: false });
    expect(await ask("manage_webhooks", { action: "delete" })).toContain(AGENT_JOB_UNATTENDED_REFUSAL);
    expect(await ask("a_tool_without_a_policy")).toContain(AGENT_JOB_UNATTENDED_REFUSAL);
  });
});
