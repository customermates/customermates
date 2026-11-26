import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { createZodError } from "@/core/validation/validation.utils";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { mutateRecordV2Tool } from "@/features/mcp-tools/record-model.mcp-tools";
import { mcpInteractorFailure, type McpTool } from "@/features/mcp-tools/mcp-tool";
import { AppErrorCode, AuthError, ForbiddenError } from "@/core/errors/app-errors";
import {
  EMAIL_VERIFICATION_REQUIRED_MESSAGE,
  EmailVerificationRequiredError,
} from "@/core/auth/email-verification-required-error";
import { WorkspacePlanRequiredError } from "@/core/auth/workspace-plan-required-error";
import { ApiRateLimitExceededError } from "@/core/auth/api-rate-limit-exceeded-error";
import { MCP_SERVER_INFO } from "@/features/mcp-tools/server-metadata";
import { buildMcpServerCard } from "@/features/mcp-tools/server-card";

const sentry = vi.hoisted(() => ({ captureException: vi.fn() }));
const apiKeys = vi.hoisted(() => ({
  isMcpApiKeyValid: vi.fn(() => Promise.resolve(true)),
  isMcpBearerValid: vi.fn(() => Promise.resolve(true)),
  resolveMcpCredentialWorkspace: vi.fn((_headers: Headers) =>
    Promise.resolve<{
      credential: "apiKey" | "bearer";
      email: string;
      companyId: string | null;
      accountWide: boolean;
      agentJobKey: null;
    } | null>({
      credential: "apiKey",
      email: "member@example.com",
      companyId: "6f1c2b9e-4d3a-4b8c-9e7f-0a1b2c3d4e5f",
      accountWide: false,
      agentJobKey: null,
    }),
  ),
  authorize: vi.fn(() => Promise.resolve({ ok: true, data: true })),
  firstCall: vi.fn((): Promise<unknown> => Promise.resolve({ ok: true, data: { recorded: true } })),
}));

const requestLimit = vi.hoisted(() => ({ exemptCurrentRequestFromIntegrationLimit: vi.fn(() => Promise.resolve()) }));
const access = vi.hoisted(() => ({
  resolve: vi.fn(),
  defaultWorkspace: vi.fn(),
  isWorkspace: vi.fn((companyId: string, requested: string) =>
    Promise.resolve(requested === companyId || requested === `slug-${companyId}`),
  ),
}));

vi.mock("@/core/observability/server", () => sentry);
vi.mock("@/ee/subscription/integration-request-limiter", () => requestLimit);
vi.mock("@/env", () => ({ env: { BASE_URL: "http://localhost:4105" } }));
vi.mock("@/core/di", () => ({
  getUpsertCustomColumnInteractor: vi.fn(),
  getGetCustomColumnsInteractor: vi.fn(),
  getGetCustomColumnsByEntityTypeInteractor: vi.fn(),
  getDeleteCustomColumnInteractor: vi.fn(),
  getAuthService: () => apiKeys,
  getMcpWorkspaceAccessService: () => access,
  getAuthorizeMcpConnectionInteractor: () => ({ invoke: apiKeys.authorize }),
  getRecordAgentFirstCallInteractor: () => ({ invoke: apiKeys.firstCall }),
}));

import { currentMcpWorkspace } from "@/features/auth/mcp-workspace-context";

import { ANONYMOUS_DISCOVERY_REQUESTS_PER_MINUTE, createMcpRoute, readMcpToolCall } from "../mcp-route-utils";

const expectedFailureTool: McpTool = {
  name: "expected_failure",
  title: "Expected failure",
  description: "Returns a structured expected failure.",
  inputSchema: z.object({}),
  outputSchema: z.object({ value: z.string() }),
  execute: () =>
    mcpInteractorFailure(
      createZodError("Webhook missing", ["id"], {
        error: CustomErrorCode.webhookNotFound,
      }),
    ),
};

const unexpectedFailure = new Error("db-password=must-not-leak");
const unexpectedFailureTool: McpTool = {
  name: "unexpected_failure",
  title: "Unexpected failure",
  description: "Throws an unexpected failure.",
  inputSchema: z.object({}),
  execute: () => {
    throw unexpectedFailure;
  },
};

function requestBody(method: string, id?: number) {
  return {
    jsonrpc: "2.0",
    ...(id === undefined ? {} : { id }),
    method,
    ...(method === "initialize"
      ? {
          params: {
            protocolVersion: "2025-03-26",
            capabilities: {},
            clientInfo: { name: "test", version: "1" },
          },
        }
      : {}),
  };
}

const WORKSPACE = "6f1c2b9e-4d3a-4b8c-9e7f-0a1b2c3d4e5f";
const OTHER_WORKSPACE = "0b7d6c5a-2e1f-4a3b-8c9d-1e2f3a4b5c6d";

function credentialOf(credential: "apiKey" | "bearer", companyId: string | null) {
  return { credential, email: "member@example.com", companyId, accountWide: false, agentJobKey: null };
}

async function rpc(
  handler: (request: Request, workspaceId?: string) => Promise<Response>,
  body: Record<string, unknown>,
  sessionId?: string,
  options: { workspaceId?: string; credential?: Record<string, string> } = {},
) {
  const path = options.workspaceId ? `/api/v1/mcp/w/${options.workspaceId}` : "/api/v1/mcp";
  const response = await handler(
    new Request(`http://localhost:4105${path}?toolsets=test`, {
      method: "POST",
      headers: {
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
        ...(options.credential ?? { "x-api-key": "test" }),
        ...(sessionId ? { "mcp-session-id": sessionId } : {}),
      },
      body: JSON.stringify(body),
    }),
    options.workspaceId,
  );
  const text = await response.text();
  const data = response.headers.get("content-type")?.includes("application/json")
    ? JSON.parse(text)
    : text
        .split("\n")
        .filter((line) => line.startsWith("data: "))
        .map((line) => JSON.parse(line.slice(6)) as Record<string, unknown>)
        .at(-1);
  return { response, data, text };
}

describe("public MCP execution boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("round-trips structured expected failures and redacts unexpected failures", async () => {
    const handler = createMcpRoute({
      test: [expectedFailureTool, unexpectedFailureTool, mutateRecordV2Tool],
    });
    const initialized = await rpc(handler, requestBody("initialize", 1));
    const sessionId = initialized.response.headers.get("mcp-session-id") ?? undefined;

    expect(initialized.response.status).toBe(200);
    expect(initialized.data?.result).toMatchObject({ serverInfo: MCP_SERVER_INFO });
    if (sessionId) await rpc(handler, requestBody("notifications/initialized"), sessionId);

    const listed = await rpc(handler, requestBody("tools/list", 2), sessionId);
    const tools = (listed.data?.result as { tools?: Array<Record<string, unknown>> } | undefined)?.tools ?? [];
    expect(tools).toEqual(buildMcpServerCard([expectedFailureTool, unexpectedFailureTool, mutateRecordV2Tool]).tools);
    const expectedDefinition = tools.find((tool) => tool.name === "expected_failure");
    expect(expectedDefinition?.outputSchema).toMatchObject({
      type: "object",
      properties: { value: { type: "string" } },
      required: ["value"],
    });
    const recordDefinition = tools.find((tool) => tool.name === "mutate_crm_record");
    expect(recordDefinition?.inputSchema).toMatchObject({
      type: "object",
      required: ["expectedRevision", "idempotencyKey", "mutation"],
    });
    expect(JSON.stringify(recordDefinition?.inputSchema)).toContain("recordId");
    expect(JSON.stringify(recordDefinition?.inputSchema)).toContain("typeId");

    const expected = await rpc(
      handler,
      {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "expected_failure", arguments: {} },
      },
      sessionId,
    );
    expect(expected.data?.result).toMatchObject({
      isError: true,
      _meta: {
        failure: {
          kind: "not_found",
          issues: [
            {
              customCode: "webhookNotFound",
              message: "Webhook missing",
              path: ["id"],
            },
          ],
        },
      },
    });
    expect((expected.data?.result as { structuredContent?: unknown }).structuredContent).toBeUndefined();
    expect(sentry.captureException).not.toHaveBeenCalled();

    const unexpected = await rpc(
      handler,
      {
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: { name: "unexpected_failure", arguments: {} },
      },
      sessionId,
    );
    expect(unexpected.data?.result).toMatchObject({
      isError: true,
      _meta: {
        failure: {
          kind: "unavailable",
          issues: [{ code: "custom", path: [], message: expect.stringContaining("unexpected server error") }],
        },
      },
    });
    expect(unexpected.text).toContain("The operation could not be completed");
    expect(unexpected.text).not.toContain("db-password");
    expect(sentry.captureException).toHaveBeenCalledTimes(1);
    const captured = sentry.captureException.mock.calls[0]?.[0];
    expect(captured).toMatchObject({ message: "The MCP tool could not be completed." });
    expect((captured as Error).cause).toBeUndefined();
    expect(captured).not.toBe(unexpectedFailure);
    expect((captured as Error).stack).not.toContain("must-not-leak");
  });

  it("rejects an invalid or expired API key with the OAuth challenge before any tool runs", async () => {
    const handler = createMcpRoute({ test: [expectedFailureTool] });
    apiKeys.isMcpApiKeyValid.mockResolvedValueOnce(false);

    const rejected = await rpc(handler, requestBody("initialize", 1));

    expect(rejected.response.status).toBe(401);
    expect(rejected.response.headers.get("www-authenticate")).toBe(
      'Bearer resource_metadata="http://localhost:4105/.well-known/oauth-protected-resource/api/v1/mcp"',
    );
    expect(apiKeys.isMcpApiKeyValid).toHaveBeenCalledWith(expect.any(Headers));
  });

  it("rejects unknown toolsets with the valid toolset names", async () => {
    const handler = createMcpRoute({ test: [expectedFailureTool], other: [unexpectedFailureTool] });
    const response = await handler(
      new Request("http://localhost:4105/api/v1/mcp?toolsets=test,nonsense", {
        method: "POST",
        headers: {
          accept: "application/json, text/event-stream",
          "content-type": "application/json",
          "x-api-key": "test",
        },
        body: JSON.stringify(requestBody("initialize", 1)),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: "invalid_toolsets",
      unknown: ["nonsense"],
      validToolsets: ["test", "other"],
    });
  });

  it("refuses an inactive member's credential with a structured 403 before any tool is listed", async () => {
    const handler = createMcpRoute({ test: [expectedFailureTool] });
    apiKeys.authorize.mockRejectedValueOnce(
      new ForbiddenError("Your account is currently inactive.", AppErrorCode.inactiveUser),
    );

    const refused = await rpc(handler, requestBody("initialize", 1));

    expect(refused.response.status).toBe(403);
    expect(refused.data).toMatchObject({ error: "inactive_user", message: "Your account is currently inactive." });
  });

  it("refuses the credential of an account overdue for email verification with a structured 403", async () => {
    const handler = createMcpRoute({ test: [expectedFailureTool] });
    apiKeys.authorize.mockRejectedValueOnce(new EmailVerificationRequiredError());

    const refused = await rpc(handler, requestBody("initialize", 1));

    expect(refused.response.status).toBe(403);
    expect(refused.data).toMatchObject({ error: "email_not_verified", message: EMAIL_VERIFICATION_REQUIRED_MESSAGE });
  });

  it("refuses a valid credential without the API & Webhooks permission with a structured 403", async () => {
    const handler = createMcpRoute({ test: [expectedFailureTool] });
    apiKeys.authorize.mockRejectedValueOnce(
      new ForbiddenError("Access denied. Required permissions: readAll on api", AppErrorCode.permissionDenied),
    );

    const refused = await rpc(handler, requestBody("initialize", 1));

    expect(refused.response.status).toBe(403);
    expect(refused.data).toMatchObject({
      error: "insufficient_permissions",
      requiredPermission: { resource: "api", action: "readAll" },
    });
  });

  it("refuses a credential of a workspace that has no plan yet with a structured 403", async () => {
    const handler = createMcpRoute({ test: [expectedFailureTool] });
    apiKeys.authorize.mockRejectedValueOnce(new WorkspacePlanRequiredError());

    const refused = await rpc(handler, requestBody("initialize", 1));

    expect(refused.response.status).toBe(403);
    expect(refused.data).toMatchObject({ error: "plan_required", message: expect.stringContaining("no plan yet") });
  });

  it("counts only tool calls toward the Free plan request limit", async () => {
    const handler = createMcpRoute({ test: [expectedFailureTool] });
    requestLimit.exemptCurrentRequestFromIntegrationLimit.mockClear();

    await rpc(handler, requestBody("initialize", 1));
    expect(requestLimit.exemptCurrentRequestFromIntegrationLimit).toHaveBeenCalledOnce();

    requestLimit.exemptCurrentRequestFromIntegrationLimit.mockClear();
    await rpc(handler, {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "expected_failure", arguments: {} },
    });
    expect(requestLimit.exemptCurrentRequestFromIntegrationLimit).not.toHaveBeenCalled();
  });

  it("detects tool calls in single and batched JSON-RPC bodies", async () => {
    const post = (body: unknown) =>
      new Request("http://localhost:4105/api/v1/mcp", { method: "POST", body: JSON.stringify(body) });

    expect(await readMcpToolCall(post(requestBody("initialize", 1)))).toMatchObject({
      toolCall: false,
      singleToolCallId: null,
    });
    expect(await readMcpToolCall(post(requestBody("tools/list", 2)))).toMatchObject({
      toolCall: false,
      singleToolCallId: null,
    });
    expect(await readMcpToolCall(post(requestBody("tools/call", 3)))).toMatchObject({
      toolCall: true,
      singleToolCallId: 3,
    });
    expect(await readMcpToolCall(post([requestBody("tools/call", 4), requestBody("tools/list", 5)]))).toMatchObject({
      toolCall: true,
      singleToolCallId: null,
    });
    expect(await readMcpToolCall(new Request("http://localhost:4105/api/v1/mcp"))).toMatchObject({
      toolCall: false,
      singleToolCallId: null,
    });
    expect(
      await readMcpToolCall(new Request("http://localhost:4105/api/v1/mcp", { method: "POST", body: "not json" })),
    ).toMatchObject({ toolCall: false, singleToolCallId: null });
  });

  it("reads the tool name and workspace argument of every tool call and the workspace of a prompt read", async () => {
    const post = (body: unknown) =>
      new Request("http://localhost:4105/api/v1/mcp", { method: "POST", body: JSON.stringify(body) });
    const call = (id: number, name: string, args: Record<string, unknown>) => ({
      jsonrpc: "2.0",
      id,
      method: "tools/call",
      params: { name, arguments: args },
    });

    expect(await readMcpToolCall(post(call(1, "query_crm_records", { workspace: " acme ", typeId: "x" })))).toEqual({
      toolCall: true,
      singleToolCallId: 1,
      calls: [{ name: "query_crm_records", workspace: "acme" }],
      promptWorkspace: null,
    });
    expect(
      await readMcpToolCall(post([call(2, "list_workspaces", {}), call(3, "read_crm_record", { workspace: 7 })])),
    ).toMatchObject({
      calls: [
        { name: "list_workspaces", workspace: null },
        { name: "read_crm_record", workspace: null },
      ],
    });
    expect(
      await readMcpToolCall(
        post({
          jsonrpc: "2.0",
          id: 4,
          method: "prompts/get",
          params: { name: "setup-from-template", arguments: { template: "client-tracker", workspace: "acme" } },
        }),
      ),
    ).toMatchObject({ toolCall: false, promptWorkspace: "acme" });
  });

  it("answers a rate-limited tool call with a tool error the agent can relay, naming the plan and the upgrade", async () => {
    const handler = createMcpRoute({ test: [expectedFailureTool] });
    const upgrade = {
      plan: "Starter",
      price: "€12",
      url: "http://localhost:4105/dashboard?open=%2Fsettings%2Fbilling",
    };
    apiKeys.authorize.mockRejectedValueOnce(new ApiRateLimitExceededError("minute", 30, 20, upgrade));

    const refused = await rpc(handler, {
      jsonrpc: "2.0",
      id: 7,
      method: "tools/call",
      params: { name: "expected_failure", arguments: {} },
    });

    expect(refused.response.status).toBe(200);
    expect(refused.response.headers.get("retry-after")).toBe("20");
    expect(refused.data).toMatchObject({
      jsonrpc: "2.0",
      id: 7,
      result: {
        isError: true,
        content: [{ type: "text", text: expect.stringContaining("Tell the user that the Free plan") }],
        structuredContent: {
          error: "rate_limited",
          plan: "free",
          window: "minute",
          limit: 30,
          retryAfterSeconds: 20,
          upgrade: { plan: "starter", price: "€12", url: upgrade.url },
        },
      },
    });
  });

  it("answers a rate-limited request that is not a single tool call with 429 and the upgrade", async () => {
    const handler = createMcpRoute({ test: [expectedFailureTool] });
    const upgrade = { plan: "Starter", price: "€12", url: "http://localhost:4105/dashboard" };
    apiKeys.authorize.mockRejectedValueOnce(new ApiRateLimitExceededError("day", 200, 7200, upgrade));

    const refused = await rpc(handler, requestBody("initialize", 1));

    expect(refused.response.status).toBe(429);
    expect(refused.data).toMatchObject({
      error: "rate_limited",
      plan: "free",
      message: expect.stringContaining("The daily limit resets in about 2 hours."),
      upgrade: { plan: "starter", url: upgrade.url },
    });
  });

  it("serves the same MCP server at a workspace's URL to a credential of that workspace", async () => {
    const handler = createMcpRoute({ test: [expectedFailureTool] });

    const initialized = await rpc(handler, requestBody("initialize", 1), undefined, { workspaceId: WORKSPACE });
    const sessionId = initialized.response.headers.get("mcp-session-id") ?? undefined;
    const listed = await rpc(handler, requestBody("tools/list", 2), sessionId, { workspaceId: WORKSPACE });

    expect(initialized.response.status).toBe(200);
    expect(listed.response.status).toBe(200);
    expect((listed.data?.result as { tools?: Array<{ name: string }> }).tools?.map((tool) => tool.name)).toEqual([
      "expected_failure",
    ]);
    expect(apiKeys.resolveMcpCredentialWorkspace).toHaveBeenCalledWith(expect.any(Headers));
    expect(apiKeys.isMcpApiKeyValid).not.toHaveBeenCalled();
    expect(apiKeys.authorize).toHaveBeenCalled();
  });

  it("records the workspace's first authenticated call and not a refused one", async () => {
    const handler = createMcpRoute({ test: [expectedFailureTool] });

    await rpc(handler, requestBody("initialize", 1), undefined, { workspaceId: WORKSPACE });
    expect(apiKeys.firstCall).toHaveBeenCalledTimes(1);

    apiKeys.authorize.mockRejectedValueOnce(new WorkspacePlanRequiredError());
    const refused = await rpc(handler, requestBody("initialize", 1), undefined, { workspaceId: WORKSPACE });
    expect(refused.response.status).toBe(403);
    expect(apiKeys.firstCall).toHaveBeenCalledTimes(1);

    apiKeys.resolveMcpCredentialWorkspace.mockResolvedValueOnce(credentialOf("apiKey", OTHER_WORKSPACE));
    await rpc(handler, requestBody("initialize", 1), undefined, { workspaceId: WORKSPACE });
    expect(apiKeys.firstCall).toHaveBeenCalledTimes(1);
  });

  it("serves the request and reports when the first call cannot be recorded", async () => {
    const handler = createMcpRoute({ test: [expectedFailureTool] });
    apiKeys.firstCall.mockRejectedValueOnce(new Error("database is down"));

    const initialized = await rpc(handler, requestBody("initialize", 1), undefined, { workspaceId: WORKSPACE });

    expect(initialized.response.status).toBe(200);
    expect(sentry.captureException).toHaveBeenCalledTimes(1);
  });

  it("asks a client without a credential to authorize for the workspace's own resource", async () => {
    const handler = createMcpRoute({ test: [expectedFailureTool] });

    const challenged = await rpc(handler, requestBody("initialize", 1), undefined, {
      workspaceId: WORKSPACE,
      credential: {},
    });

    expect(challenged.response.status).toBe(401);
    expect(challenged.response.headers.get("www-authenticate")).toBe(
      `Bearer resource_metadata="http://localhost:4105/.well-known/oauth-protected-resource/api/v1/mcp/w/${WORKSPACE}"`,
    );
    expect(apiKeys.resolveMcpCredentialWorkspace).not.toHaveBeenCalled();
    expect(apiKeys.authorize).not.toHaveBeenCalled();
  });

  it("challenges an invalid credential at a workspace's URL", async () => {
    const handler = createMcpRoute({ test: [expectedFailureTool] });
    apiKeys.resolveMcpCredentialWorkspace.mockResolvedValueOnce(null);

    const challenged = await rpc(handler, requestBody("initialize", 1), undefined, { workspaceId: WORKSPACE });

    expect(challenged.response.status).toBe(401);
    expect(challenged.response.headers.get("www-authenticate")).toContain(
      `/.well-known/oauth-protected-resource/api/v1/mcp/w/${WORKSPACE}"`,
    );
    expect(apiKeys.authorize).not.toHaveBeenCalled();
  });

  it.each([OTHER_WORKSPACE, null])(
    "answers an OAuth token bound to %s with invalid_token so the client authorizes for this workspace",
    async (companyId) => {
      const handler = createMcpRoute({ test: [expectedFailureTool] });
      apiKeys.resolveMcpCredentialWorkspace.mockResolvedValueOnce(credentialOf("bearer", companyId));

      const refused = await rpc(handler, requestBody("initialize", 1), undefined, {
        workspaceId: WORKSPACE,
        credential: { authorization: "Bearer foreign-token" },
      });

      expect(refused.response.status).toBe(401);
      expect(refused.response.headers.get("www-authenticate")).toBe(
        `Bearer error="invalid_token", error_description="The access token belongs to another workspace. Connect again through this MCP URL.", resource_metadata="http://localhost:4105/.well-known/oauth-protected-resource/api/v1/mcp/w/${WORKSPACE}"`,
      );
      expect(refused.response.headers.get("access-control-expose-headers")).toBe("WWW-Authenticate");
      expect(refused.data).toMatchObject({ error: "invalid_token" });
      expect(apiKeys.authorize).not.toHaveBeenCalled();
    },
  );

  it("refuses an API key of another workspace with a structured 403", async () => {
    const handler = createMcpRoute({ test: [expectedFailureTool] });
    apiKeys.resolveMcpCredentialWorkspace.mockResolvedValueOnce(credentialOf("apiKey", OTHER_WORKSPACE));

    const refused = await rpc(handler, requestBody("initialize", 1), undefined, { workspaceId: WORKSPACE });

    expect(refused.response.status).toBe(403);
    expect(refused.response.headers.get("www-authenticate")).toBeNull();
    expect(refused.data).toMatchObject({
      error: "workspace_mismatch",
      message: expect.stringContaining("belongs to another workspace"),
    });
    expect(apiKeys.authorize).not.toHaveBeenCalled();
  });

  it("keeps every membership refusal at a workspace's URL and points its challenge there", async () => {
    const handler = createMcpRoute({ test: [expectedFailureTool] });
    apiKeys.authorize.mockRejectedValueOnce(new WorkspacePlanRequiredError());
    apiKeys.authorize.mockRejectedValueOnce(new AuthError());

    const unpaid = await rpc(handler, requestBody("initialize", 1), undefined, { workspaceId: WORKSPACE });
    const removed = await rpc(handler, requestBody("initialize", 1), undefined, { workspaceId: WORKSPACE });

    expect(unpaid.response.status).toBe(403);
    expect(unpaid.data).toMatchObject({ error: "plan_required" });
    expect(removed.response.status).toBe(401);
    expect(removed.response.headers.get("www-authenticate")).toContain(`/api/v1/mcp/w/${WORKSPACE}"`);
  });

  it("keeps an API key at the bare endpoint in its own workspace without consulting the account", async () => {
    const handler = createMcpRoute({ test: [expectedFailureTool] });

    const initialized = await rpc(handler, requestBody("initialize", 1));

    expect(initialized.response.status).toBe(200);
    expect(apiKeys.isMcpApiKeyValid).toHaveBeenCalled();
    expect(access.resolve).not.toHaveBeenCalled();
    expect(access.defaultWorkspace).not.toHaveBeenCalled();
  });

  it("answers two parallel connections that number their requests alike, each with its own workspace's data", async () => {
    let entered = 0;
    const firstEntered = Promise.withResolvers<null>();
    const secondEntered = Promise.withResolvers<null>();
    const workspaceTool: McpTool = {
      name: "workspace_name",
      title: "Workspace name",
      description: "Answers with the workspace of the calling credential.",
      inputSchema: z.object({}),
      execute: async (_input: unknown, extra: { requestInfo?: { headers?: Record<string, string> } }) => {
        const workspace = extra.requestInfo?.headers?.["x-api-key"] ?? "none";
        entered += 1;
        if (entered === 1) {
          firstEntered.resolve(null);
          await secondEntered.promise;
        } else secondEntered.resolve(null);
        return `workspace:${workspace}`;
      },
    };
    apiKeys.resolveMcpCredentialWorkspace.mockImplementation((headers: Headers) =>
      Promise.resolve(credentialOf("apiKey", headers.get("x-api-key"))),
    );
    const handler = createMcpRoute({ test: [workspaceTool] });
    const call = {
      jsonrpc: "2.0",
      id: 0,
      method: "tools/call",
      params: { name: "workspace_name", arguments: {} },
    };
    const callFrom = (workspaceId: string) =>
      rpc(handler, call, undefined, {
        workspaceId,
        credential: { "x-api-key": workspaceId },
      });

    const first = callFrom(WORKSPACE);
    await firstEntered.promise;
    const second = await callFrom(OTHER_WORKSPACE);

    expect(entered).toBe(2);
    expect((await first).data).toMatchObject({
      id: 0,
      result: { content: [{ text: `workspace:${WORKSPACE}` }] },
    });
    expect(second.data).toMatchObject({
      id: 0,
      result: { content: [{ text: `workspace:${OTHER_WORKSPACE}` }] },
    });
  }, 5_000);
});

describe("anonymous MCP discovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const executed = vi.fn();
  const discoverableTool: McpTool = {
    name: "discoverable",
    title: "Discoverable",
    description: "Returns a fixed value.",
    inputSchema: z.object({}),
    execute: () => {
      executed();
      return Promise.resolve("ran");
    },
  };
  const anonymous = { credential: {} };

  it("answers initialize and tools/list without a credential and never consults the auth services", async () => {
    const handler = createMcpRoute({ test: [discoverableTool] });

    const initialized = await rpc(handler, requestBody("initialize", 1), undefined, anonymous);
    expect(initialized.response.status).toBe(200);
    expect(initialized.data?.result).toMatchObject({ serverInfo: MCP_SERVER_INFO });
    const sessionId = initialized.response.headers.get("mcp-session-id") ?? undefined;

    const notified = await rpc(handler, requestBody("notifications/initialized"), sessionId, anonymous);
    expect(notified.response.status).toBeLessThan(300);

    const listed = await rpc(handler, requestBody("tools/list", 2), sessionId, anonymous);
    expect(listed.response.status).toBe(200);
    expect(listed.data?.result).toMatchObject({ tools: [{ name: "discoverable" }] });

    expect(apiKeys.isMcpApiKeyValid).not.toHaveBeenCalled();
    expect(apiKeys.isMcpBearerValid).not.toHaveBeenCalled();
    expect(apiKeys.authorize).not.toHaveBeenCalled();
    expect(executed).not.toHaveBeenCalled();
  });

  it.each([
    ["a tool call", { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "discoverable", arguments: {} } }],
    ["a resource list", requestBody("resources/list", 4)],
    ["a prompt read", { jsonrpc: "2.0", id: 5, method: "prompts/get", params: { name: "get-started" } }],
    ["a batch that hides a tool call behind tools/list", [requestBody("tools/list", 6), requestBody("tools/call", 7)]],
  ])("still challenges %s without a credential", async (_label, body) => {
    const handler = createMcpRoute({ test: [discoverableTool] });

    const challenged = await rpc(handler, body as Record<string, unknown>, undefined, anonymous);

    expect(challenged.response.status).toBe(401);
    expect(challenged.response.headers.get("www-authenticate")).toBe(
      'Bearer resource_metadata="http://localhost:4105/.well-known/oauth-protected-resource/api/v1/mcp"',
    );
    expect(executed).not.toHaveBeenCalled();
  });

  it("keeps the challenge for an invalid credential even on discovery, so the client signs in again", async () => {
    const handler = createMcpRoute({ test: [discoverableTool] });
    apiKeys.isMcpBearerValid.mockResolvedValueOnce(false);

    const challenged = await rpc(handler, requestBody("tools/list", 1), undefined, {
      credential: { authorization: "Bearer expired" },
    });

    expect(challenged.response.status).toBe(401);
  });

  it("does not open discovery at a workspace's URL", async () => {
    const handler = createMcpRoute({ test: [discoverableTool] });

    const challenged = await rpc(handler, requestBody("tools/list", 1), undefined, {
      workspaceId: WORKSPACE,
      credential: {},
    });

    expect(challenged.response.status).toBe(401);
  });

  it("limits discovery per address and leaves other addresses and signed-in clients alone", async () => {
    const handler = createMcpRoute({ test: [discoverableTool] });
    const ping = (address: string, credential: Record<string, string> = {}) =>
      handler(
        new Request("http://localhost:4105/api/v1/mcp?toolsets=test", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            accept: "application/json, text/event-stream",
            "x-real-ip": address,
            ...credential,
          },
          body: JSON.stringify(requestBody("ping", 1)),
        }),
      );

    for (let request = 0; request < ANONYMOUS_DISCOVERY_REQUESTS_PER_MINUTE; request++)
      expect((await ping("203.0.113.7")).status, `request ${request + 1}`).toBe(200);

    const limited = await ping("203.0.113.7");
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(await limited.json()).toMatchObject({ error: "rate_limited" });

    expect((await ping("203.0.113.8")).status).toBe(200);
    expect((await ping("203.0.113.7", { "x-api-key": "valid" })).status).toBe(200);
  });

  it("challenges a stream or session request without a credential", async () => {
    const handler = createMcpRoute({ test: [discoverableTool] });

    for (const method of ["GET", "DELETE"]) {
      const response = await handler(new Request("http://localhost:4105/api/v1/mcp", { method }));
      expect(response.status).toBe(401);
    }
  });
});

describe("account-wide MCP connection", () => {
  const bearer = { authorization: "Bearer account-token" };
  const echoTool: McpTool = {
    name: "workspace_echo",
    title: "Workspace echo",
    description: "Returns the workspace the call works in.",
    inputSchema: z.object({ note: z.string().optional() }),
    execute: (input: { note?: string }) => JSON.stringify({ workspace: currentMcpWorkspace(), input }),
  };
  const accountTool: McpTool = {
    name: "account_echo",
    title: "Account echo",
    description: "Runs for the whole account.",
    scope: "account",
    inputSchema: z.object({}),
    execute: () => JSON.stringify({ workspace: currentMcpWorkspace() }),
  };
  const planTool: McpTool = {
    name: "plan_limited",
    title: "Plan limited",
    description: "Hits a plan limit.",
    inputSchema: z.object({}),
    execute: () =>
      mcpInteractorFailure(
        createZodError("Record limit reached", [], { error: CustomErrorCode.planRecordLimitReached }),
      ),
  };
  const call = (name: string, args: Record<string, unknown> = {}, id = 1) => ({
    jsonrpc: "2.0",
    id,
    method: "tools/call",
    params: { name, arguments: args },
  });
  const handler = () => createMcpRoute({ test: [echoTool, planTool] }, [accountTool]);
  const text = (data: Record<string, unknown> | undefined) =>
    String(((data?.result as { content?: Array<{ text: string }> })?.content ?? [])[0]?.text ?? "");

  beforeEach(() => {
    vi.clearAllMocks();
    apiKeys.resolveMcpCredentialWorkspace.mockResolvedValue({
      credential: "bearer",
      email: "member@example.com",
      companyId: null,
      accountWide: true,
      agentJobKey: null,
    });
    access.resolve.mockResolvedValue({ ok: true, workspace: { companyId: WORKSPACE, slug: "acme" } });
    access.defaultWorkspace.mockResolvedValue(null);
  });

  it("adds the optional workspace argument to every workspace tool and leaves account tools without it", async () => {
    const listed = await rpc(handler(), requestBody("tools/list", 1), undefined, { credential: bearer });
    const tools = (listed.data?.result as { tools: Array<{ name: string; inputSchema: { properties?: object } }> })
      .tools;

    expect(Object.keys(tools.find((tool) => tool.name === "workspace_echo")?.inputSchema.properties ?? {})).toEqual([
      "note",
      "workspace",
    ]);
    expect(tools.find((tool) => tool.name === "account_echo")?.inputSchema.properties ?? {}).not.toHaveProperty(
      "workspace",
    );
  });

  it("runs a call without workspace in the account's only usable workspace and hides the argument from the tool", async () => {
    const result = await rpc(handler(), call("workspace_echo", { note: "hi" }), undefined, { credential: bearer });

    expect(access.resolve).toHaveBeenCalledWith("member@example.com", null);
    expect(JSON.parse(text(result.data))).toEqual({
      workspace: { companyId: WORKSPACE, slug: "acme" },
      input: { note: "hi" },
    });
    expect(apiKeys.authorize).toHaveBeenCalledOnce();
  });

  it("passes a named workspace to the resolution and runs the call there", async () => {
    access.resolve.mockResolvedValue({ ok: true, workspace: { companyId: OTHER_WORKSPACE, slug: "taxes" } });

    const result = await rpc(handler(), call("workspace_echo", { workspace: "taxes" }), undefined, {
      credential: bearer,
    });

    expect(access.resolve).toHaveBeenCalledWith("member@example.com", "taxes");
    expect(JSON.parse(text(result.data))).toMatchObject({
      workspace: { companyId: OTHER_WORKSPACE, slug: "taxes" },
      input: {},
    });
  });

  it.each([
    [
      "several workspaces and no workspace argument",
      {},
      "This account has several workspaces. … acme (acme), Taxes (taxes).",
    ],
    ["a workspace of another login", { workspace: "foreign" }, 'This account has no workspace "foreign".'],
  ])("answers %s with a tool error before the tool runs", async (_label, args, message) => {
    access.resolve.mockResolvedValue({ ok: false, message });

    const result = await rpc(handler(), call("workspace_echo", args, 9), undefined, { credential: bearer });

    expect(result.response.status).toBe(200);
    expect(result.data).toMatchObject({
      id: 9,
      result: { isError: true, _meta: { failure: { kind: "validation", issues: [{ path: ["workspace"], message }] } } },
    });
    expect(text(result.data)).toBe(message);
    expect(apiKeys.authorize).not.toHaveBeenCalled();
  });

  it("runs an account tool for a login without any usable workspace, without the workspace checks", async () => {
    const result = await rpc(handler(), call("account_echo"), undefined, { credential: bearer });

    expect(JSON.parse(text(result.data))).toEqual({ workspace: null });
    expect(access.resolve).not.toHaveBeenCalled();
    expect(apiKeys.authorize).not.toHaveBeenCalled();
  });

  it("serves discovery of a login without a default workspace without workspace checks", async () => {
    const listed = await rpc(handler(), requestBody("tools/list", 1), undefined, { credential: bearer });

    expect(listed.response.status).toBe(200);
    expect(access.defaultWorkspace).toHaveBeenCalledWith("member@example.com", null);
    expect(apiKeys.authorize).not.toHaveBeenCalled();
  });

  it("refuses an API key that names another workspace than its own", async () => {
    apiKeys.resolveMcpCredentialWorkspace.mockResolvedValue({
      credential: "apiKey",
      email: "member@example.com",
      companyId: WORKSPACE,
      accountWide: false,
      agentJobKey: null,
    });

    const own = await rpc(handler(), call("workspace_echo", { workspace: `slug-${WORKSPACE}` }, 1));
    const foreign = await rpc(handler(), call("workspace_echo", { workspace: "taxes" }, 2));

    expect(JSON.parse(text(own.data))).toMatchObject({ workspace: null });
    expect(foreign.data).toMatchObject({ id: 2, result: { isError: true } });
    expect(text(foreign.data)).toContain("An API key always works in the workspace it was created in");
    expect(access.resolve).not.toHaveBeenCalled();
  });

  it("keeps a token approved for one workspace locked to it at the account URL and tells how to widen it", async () => {
    apiKeys.resolveMcpCredentialWorkspace.mockResolvedValue({
      credential: "bearer",
      email: "member@example.com",
      companyId: WORKSPACE,
      accountWide: false,
      agentJobKey: null,
    });

    const plain = await rpc(handler(), call("workspace_echo", {}, 1), undefined, { credential: bearer });
    const own = await rpc(handler(), call("workspace_echo", { workspace: WORKSPACE }, 2), undefined, {
      credential: bearer,
    });
    const other = await rpc(handler(), call("workspace_echo", { workspace: "taxes" }, 3), undefined, {
      credential: bearer,
    });

    expect(JSON.parse(text(plain.data))).toMatchObject({ workspace: null });
    expect(JSON.parse(text(own.data))).toMatchObject({ workspace: null });
    expect(text(other.data)).toContain("approved for one workspace only");
    expect(text(other.data)).toContain("connect again");
    expect(access.resolve).not.toHaveBeenCalled();
    expect(access.defaultWorkspace).not.toHaveBeenCalled();
  });

  it("keeps an older workspace URL locked to its workspace", async () => {
    apiKeys.resolveMcpCredentialWorkspace.mockResolvedValue({
      credential: "bearer",
      email: "member@example.com",
      companyId: WORKSPACE,
      accountWide: true,
      agentJobKey: null,
    });

    const same = await rpc(handler(), call("workspace_echo", { workspace: WORKSPACE }, 1), undefined, {
      credential: bearer,
      workspaceId: WORKSPACE,
    });
    const other = await rpc(handler(), call("workspace_echo", { workspace: "taxes" }, 2), undefined, {
      credential: bearer,
      workspaceId: WORKSPACE,
    });

    expect(JSON.parse(text(same.data))).toMatchObject({ workspace: null, input: {} });
    expect(text(other.data)).toContain("locked to that workspace");
    expect(access.resolve).not.toHaveBeenCalled();
  });

  it("refuses calls for two workspaces in one request", async () => {
    const result = await rpc(
      handler(),
      [call("workspace_echo", { workspace: "acme" }, 1), call("workspace_echo", { workspace: "taxes" }, 2)] as never,
      undefined,
      { credential: bearer },
    );

    expect(result.response.status).toBe(400);
    expect(access.resolve).not.toHaveBeenCalled();
  });

  it("adds the workspace's plan link to a plan-limit failure", async () => {
    const result = await rpc(handler(), call("plan_limited"), undefined, { credential: bearer });

    expect(result.data).toMatchObject({
      result: {
        isError: true,
        _meta: { choosePlanUrl: "http://localhost:4105/w/acme/settings/billing" },
      },
    });
    expect(text(result.data)).toContain("Choose a plan: http://localhost:4105/w/acme/settings/billing");
  });
});
