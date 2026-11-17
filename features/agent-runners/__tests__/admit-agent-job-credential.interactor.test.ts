import { describe, expect, it, vi } from "vitest";

import { MOCK_ENV_MODULE, MOCK_PRISMA_DB_MODULE, MOCK_ZOD_MODULE } from "@/tests/helpers/interactor-test-setup";

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);

import { agentJobCausation } from "@/ee/agent-runtime/agent-job-toolset";

import { AdmitAgentJobCredentialInteractor } from "../admit-agent-job-credential.interactor";
import {
  admitsAgentJobKey,
  agentJobRequestCausation,
  currentAgentJobRequest,
  runAsAgentJobRequest,
} from "../agent-job-request-context";
import { agentJobToolNeedsApproval } from "../agent-job-tool-gate";

import { COMPANY_ID, JOB_ID, RUNNER_ID } from "./agent-runner-fixtures";
import { FakeAgentJobRunnerRepo } from "./fake-agent-job-runner-repo";

const KEY = { keyId: "key-1", companyId: COMPANY_ID, jobId: JOB_ID, attempt: 2, runnerId: RUNNER_ID };

function setup(job: { status: string; attempts?: number; runnerId?: string; ruleChain?: string[] }) {
  const jobs = new FakeAgentJobRunnerRepo();
  jobs.addJob({ runnerId: RUNNER_ID, attempts: 2, ruleChain: ["rule-1"], ...job });
  return new AdmitAgentJobCredentialInteractor(jobs);
}

describe("AdmitAgentJobCredentialInteractor", () => {
  it("admits the key while its attempt runs on its runner and hands over the job's rule chain", async () => {
    expect(await setup({ status: "running" }).invoke(KEY)).toEqual({
      keyId: "key-1",
      companyId: COMPANY_ID,
      jobId: JOB_ID,
      attempt: 2,
      ruleChain: ["rule-1"],
    });
  });

  it.each(["claimed", "queued", "succeeded", "failed", "timedOut", "cancelled"])(
    "refuses the key while the job is %s: before the runner confirmed it and after it ended",
    async (status) => {
      expect(await setup({ status }).invoke(KEY)).toBeNull();
    },
  );

  it("refuses the key of an earlier attempt, of another runner, of another workspace and one without a workspace", async () => {
    expect(await setup({ status: "running", attempts: 3 }).invoke(KEY)).toBeNull();
    expect(await setup({ status: "running", runnerId: "99999999-9999-4999-8999-999999999999" }).invoke(KEY)).toBeNull();
    expect(
      await setup({ status: "running" }).invoke({ ...KEY, companyId: "22222222-2222-4222-8222-222222222222" }),
    ).toBeNull();
    expect(await setup({ status: "running" }).invoke({ ...KEY, companyId: null })).toBeNull();
  });
});

describe("the request context of a job key", () => {
  const request = { keyId: "key-1", companyId: COMPANY_ID, jobId: JOB_ID, attempt: 2, ruleChain: ["rule-1"] };

  it("admits exactly the key the request was admitted for, and nothing outside such a request", async () => {
    expect(admitsAgentJobKey("key-1")).toBe(false);
    expect(currentAgentJobRequest()).toBeUndefined();

    await runAsAgentJobRequest(request, async () => {
      await Promise.resolve();
      expect(admitsAgentJobKey("key-1")).toBe(true);
      expect(admitsAgentJobKey("key-2")).toBe(false);
      expect(currentAgentJobRequest()).toEqual(request);
    });

    expect(admitsAgentJobKey("key-1")).toBe(false);
  });

  it("builds the causation hosted agent jobs run their tool calls in", () => {
    expect(agentJobRequestCausation(request)).toEqual(agentJobCausation(["rule-1"]));
    expect(agentJobRequestCausation({ ruleChain: [] })).toEqual({ routineDepth: 1, ruleChain: [] });
  });
});

describe("what a job key may call", () => {
  it("allows reads and approval-free writes and refuses what needs a person", () => {
    const write = (name: string, input?: unknown) => agentJobToolNeedsApproval({ name }, input);

    expect(agentJobToolNeedsApproval({ name: "anything", annotations: { readOnlyHint: true } }, {})).toBe(false);
    expect(write("send_email")).toBe(false);
    expect(write("manage_wiki_pages", { action: "update" })).toBe(false);
    expect(write("manage_wiki_pages", { action: "delete" })).toBe(true);
    expect(write("manage_team", { action: "update_member", roleId: "r" })).toBe(true);
    expect(write("manage_webhooks", { action: "delete" })).toBe(true);
    expect(write("request_support")).toBe(true);
    expect(write("a_tool_without_a_policy")).toBe(true);
  });
});
