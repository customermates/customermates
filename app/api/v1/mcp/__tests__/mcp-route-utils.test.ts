import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { createZodError } from "@/core/validation/validation.utils";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { mutateRecordV2Tool } from "@/features/mcp-tools/record-model.mcp-tools";
import { mcpInteractorFailure, type McpTool } from "@/features/mcp-tools/mcp-tool";
import { AppErrorCode, AuthError, ForbiddenError } from "@/core/errors/app-errors";
import { WorkspacePlanRequiredError } from "@/core/auth/workspace-plan-required-error";

const sentry = vi.hoisted(() => ({ captureException: vi.fn() }));
const apiKeys = vi.hoisted(() => ({
  isMcpApiKeyValid: vi.fn(() => Promise.resolve(true)),
  isMcpBearerValid: vi.fn(() => Promise.resolve(true)),
  resolveMcpCredentialWorkspace: vi.fn(() =>
    Promise.resolve<{ credential: "apiKey" | "bearer"; companyId: string | null } | null>({
      credential: "apiKey",
      companyId: "6f1c2b9e-4d3a-4b8c-9e7f-0a1b2c3d4e5f",
    }),
  ),
  authorize: vi.fn(() => Promise.resolve({ ok: true, data: true })),
}));

vi.mock("@sentry/nextjs", () => sentry);
vi.mock("@/env", () => ({ env: { BASE_URL: "http://localhost:4105" } }));
vi.mock("@/core/di", () => ({
  getUpsertCustomColumnInteractor: vi.fn(),
  getGetCustomColumnsInteractor: vi.fn(),
  getGetCustomColumnsByEntityTypeInteractor: vi.fn(),
  getDeleteCustomColumnInteractor: vi.fn(),
  getAuthService: () => apiKeys,
  getAuthorizeMcpConnectionInteractor: () => ({ invoke: apiKeys.authorize }),
}));

import { createMcpRoute } from "../mcp-route-utils";

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
    if (sessionId) await rpc(handler, requestBody("notifications/initialized"), sessionId);

    const listed = await rpc(handler, requestBody("tools/list", 2), sessionId);
    const tools = (listed.data?.result as { tools?: Array<Record<string, unknown>> } | undefined)?.tools ?? [];
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
      'Bearer resource_metadata="http://localhost:4105/.well-known/oauth-protected-resource"',
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
      apiKeys.resolveMcpCredentialWorkspace.mockResolvedValueOnce({ credential: "bearer", companyId });

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
    apiKeys.resolveMcpCredentialWorkspace.mockResolvedValueOnce({ credential: "apiKey", companyId: OTHER_WORKSPACE });

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

  it("does not consult the workspace binding at the bare endpoint", async () => {
    const handler = createMcpRoute({ test: [expectedFailureTool] });

    const initialized = await rpc(handler, requestBody("initialize", 1));

    expect(initialized.response.status).toBe(200);
    expect(apiKeys.isMcpApiKeyValid).toHaveBeenCalled();
    expect(apiKeys.resolveMcpCredentialWorkspace).not.toHaveBeenCalled();
  });
});
