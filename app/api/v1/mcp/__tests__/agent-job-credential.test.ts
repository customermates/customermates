import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { currentCausation } from "@/core/decorators/causation-context";
import { agentJobCausation } from "@/ee/agent-runtime/agent-job-toolset";
import { AGENT_JOB_MAX_TOOL_CALLS } from "@/features/agent-jobs/agent-job.schema";
import {
  AGENT_JOB_TOOL_LIMIT_REFUSAL,
  AGENT_JOB_UNATTENDED_REFUSAL,
} from "@/features/agent-runners/agent-job-tool-gate";
import { currentAgentJobRequest } from "@/features/agent-runners/agent-job-request-context";
import type { McpTool } from "@/features/mcp-tools/mcp-tool";

const WORKSPACE = "6f1c2b9e-4d3a-4b8c-9e7f-0a1b2c3d4e5f";
const JOB_KEY = {
  keyId: "key-1",
  companyId: WORKSPACE,
  jobId: "55555555-5555-4555-8555-555555555555",
  attempt: 1,
  runnerId: "44444444-4444-4444-8444-444444444444",
};
const RULE_CHAIN = ["rule-a", "rule-b"];

type Bound = { credential: "apiKey" | "bearer"; companyId: string | null; agentJobKey?: typeof JOB_KEY | null };

const deps = vi.hoisted(() => ({
  resolveMcpCredentialWorkspace: vi.fn(),
  countApiKeyRequest: vi.fn(),
  admit: vi.fn(),
  authorize: vi.fn(() => Promise.resolve({ ok: true, data: true })),
  firstCall: vi.fn(() => Promise.resolve({ ok: true, data: { recorded: true } })),
}));

vi.mock("@/core/observability/server", () => ({ captureException: vi.fn() }));
vi.mock("@/ee/subscription/integration-request-limiter", () => ({
  exemptCurrentRequestFromIntegrationLimit: vi.fn(() => Promise.resolve()),
}));
vi.mock("@/env", () => ({ env: { BASE_URL: "http://localhost:4105" } }));
vi.mock("@/core/di", () => ({
  getAuthService: () => ({
    resolveMcpCredentialWorkspace: deps.resolveMcpCredentialWorkspace,
    countApiKeyRequest: deps.countApiKeyRequest,
  }),
  getAdmitAgentJobCredentialInteractor: () => ({ invoke: deps.admit }),
  getAuthorizeMcpConnectionInteractor: () => ({ invoke: deps.authorize }),
  getRecordAgentFirstCallInteractor: () => ({ invoke: deps.firstCall }),
}));

import { createMcpRoute } from "../mcp-route-utils";

const executed: Array<{ tool: string; causation: unknown; job: unknown }> = [];

function tool(name: string, annotations?: Record<string, boolean>): McpTool {
  return {
    name,
    title: name,
    description: name,
    annotations,
    inputSchema: z.object({ action: z.string().optional() }),
    execute: () => {
      executed.push({ tool: name, causation: currentCausation(), job: currentAgentJobRequest() });
      return "done";
    },
  };
}

const handler = createMcpRoute({
  test: [
    tool("save_message_draft"),
    tool("manage_trash"),
    tool("query_crm_records", { readOnlyHint: true }),
    tool("unlisted_write"),
  ],
});

async function call(name: string, args: Record<string, unknown> = {}, workspaceId: string | undefined = WORKSPACE) {
  const path = workspaceId ? `/api/v1/mcp/w/${workspaceId}` : "/api/v1/mcp";
  const response = await handler(
    new Request(`http://localhost:4105${path}?toolsets=test`, {
      method: "POST",
      headers: {
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
        "x-api-key": "job-key",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
    }),
    workspaceId,
  );
  const text = await response.text();
  const data = response.headers.get("content-type")?.includes("application/json")
    ? JSON.parse(text)
    : text
        .split("\n")
        .filter((line) => line.startsWith("data: "))
        .map((line) => JSON.parse(line.slice(6)) as Record<string, unknown>)
        .at(-1);
  const result = (data as { result?: { isError?: boolean; content?: Array<{ text: string }> } } | undefined)?.result;
  return { status: response.status, isError: result?.isError === true, text: result?.content?.[0]?.text ?? "" };
}

function bind(bound: Bound) {
  deps.resolveMcpCredentialWorkspace.mockResolvedValue(bound);
}

beforeEach(() => {
  vi.clearAllMocks();
  executed.length = 0;
  bind({ credential: "apiKey", companyId: WORKSPACE, agentJobKey: JOB_KEY });
  deps.countApiKeyRequest.mockResolvedValue(true);
  deps.admit.mockResolvedValue({
    keyId: JOB_KEY.keyId,
    companyId: WORKSPACE,
    jobId: JOB_KEY.jobId,
    attempt: 1,
    ruleChain: RULE_CHAIN,
  });
});

describe("a request with the key of a runner job", () => {
  it("runs an approval-free write inside the job's causation, so the loop guard sees the rule chain", async () => {
    const result = await call("save_message_draft");

    expect(result).toMatchObject({ status: 200, isError: false, text: "done" });
    expect(executed).toHaveLength(1);
    expect(executed[0].causation).toEqual({ routineDepth: 1, ruleChain: RULE_CHAIN });
    expect(executed[0].causation).toEqual(agentJobCausation(RULE_CHAIN));
    expect(executed[0].job).toMatchObject({ keyId: JOB_KEY.keyId, jobId: JOB_KEY.jobId });
    expect(deps.admit).toHaveBeenCalledWith(JOB_KEY);
  });

  it("counts every tool call against the limit of 25 on the job's key", async () => {
    await call("query_crm_records");
    await call("save_message_draft");

    expect(deps.countApiKeyRequest.mock.calls).toEqual([
      [JOB_KEY.keyId, AGENT_JOB_MAX_TOOL_CALLS],
      [JOB_KEY.keyId, AGENT_JOB_MAX_TOOL_CALLS],
    ]);
    expect(AGENT_JOB_MAX_TOOL_CALLS).toBe(25);
  });

  it("refuses a call once the limit is reached without running the tool", async () => {
    deps.countApiKeyRequest.mockResolvedValue(false);

    const result = await call("query_crm_records");

    expect(result.isError).toBe(true);
    expect(result.text).toContain(AGENT_JOB_TOOL_LIMIT_REFUSAL);
    expect(executed).toEqual([]);
  });

  it.each([
    ["unlisted_write", {}],
    ["manage_trash", { action: "delete" }],
    ["manage_trash", {}],
  ])("refuses %s %j, which needs a person's approval, and still counts the call", async (name, args) => {
    const result = await call(name, args);

    expect(result.isError).toBe(true);
    expect(result.text).toContain(AGENT_JOB_UNATTENDED_REFUSAL);
    expect(executed).toEqual([]);
    expect(deps.countApiKeyRequest).toHaveBeenCalledTimes(1);
  });

  it("allows the approval-free action of a tool whose other actions are refused", async () => {
    const result = await call("manage_trash", { action: "restore" });

    expect(result.isError).toBe(false);
    expect(executed.map((entry) => entry.tool)).toEqual(["manage_trash"]);
  });

  it("answers 401 and runs nothing once the job is finished, cancelled, requeued or its runner revoked", async () => {
    deps.admit.mockResolvedValue(null);

    const result = await call("save_message_draft");

    expect(result.status).toBe(401);
    expect(executed).toEqual([]);
    expect(deps.countApiKeyRequest).not.toHaveBeenCalled();
    expect(deps.authorize).not.toHaveBeenCalled();
  });
});

describe("a request with an ordinary key", () => {
  it("is not counted, not gated and carries no causation", async () => {
    bind({ credential: "apiKey", companyId: WORKSPACE, agentJobKey: null });

    const result = await call("unlisted_write");

    expect(result.isError).toBe(false);
    expect(executed).toEqual([{ tool: "unlisted_write", causation: undefined, job: undefined }]);
    expect(deps.countApiKeyRequest).not.toHaveBeenCalled();
    expect(deps.admit).not.toHaveBeenCalled();
  });

  it("is served as before when the auth service reports no job key at all", async () => {
    bind({ credential: "apiKey", companyId: WORKSPACE });

    expect((await call("save_message_draft")).isError).toBe(false);
    expect(deps.admit).not.toHaveBeenCalled();
  });
});
