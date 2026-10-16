import { beforeEach, describe, expect, it, vi } from "vitest";

import type { OperatorActor } from "@/core/decorators/operator-context";
import type { BillingUsageLedger } from "@/ee/operator/get/get-operator-billing-usage.repo";

const state = vi.hoisted(() => ({
  integrationActor: vi.fn<() => Promise<OperatorActor | null>>(),
  interactiveActor: vi.fn<() => Promise<OperatorActor | null>>(),
  ledgerReads: vi.fn<() => Promise<BillingUsageLedger>>(),
}));

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("@/env", () => ({ env: { APP_MODE: "cloud", BASE_URL: "http://localhost:4105" } }));
vi.mock("next-intl/server", () => ({
  getTranslations: () => Promise.resolve({ raw: (key: string) => `localized:${key}` }),
}));
vi.mock("@/core/di", async () => {
  const { OperatorAccessService } = await import("@/ee/operator/operator-access.service");
  const { GetOperatorBillingUsageInteractor } = await import("@/ee/operator/get/get-operator-billing-usage.interactor");
  const session = {
    session: { id: "api-key-session", expiresAt: new Date(Date.now() + 60_000) },
    user: { id: "auth-id", email: "member@example.invalid" },
  };
  const authService = {
    isMcpApiKeyValid: () => Promise.resolve(true),
    isIntegrationCredentialRequest: () => Promise.resolve(true),
    getSession: () => Promise.resolve(session),
    getInteractiveSession: () => Promise.resolve(null),
  };
  const accessService = new OperatorAccessService(authService as never, {
    findAuthorizedActorUnscoped: state.interactiveActor,
    findAuthorizedIntegrationActorUnscoped: state.integrationActor,
  });

  return {
    getAuthService: () => authService,
    getAuthorizeMcpConnectionInteractor: () => ({ invoke: () => Promise.resolve({ ok: true, data: true }) }),
    getOperatorAccessService: () => accessService,
    getGetOperatorBillingUsageInteractor: () =>
      new GetOperatorBillingUsageInteractor({ readBillingUsageLedgerUnscoped: state.ledgerReads }),
  };
});

import { createMcpRoute } from "../mcp-route-utils";
import { MCP_OPERATOR_TOOLS } from "@/features/mcp-tools/tool-registry";
import { listUsersTool } from "@/features/mcp-tools/workspace.mcp-tools";

const OPERATOR: OperatorActor = {
  authUserId: "auth-id",
  userId: "00000000-0000-4000-8000-000000000001",
  companyId: "00000000-0000-4000-8000-000000000002",
  email: "operator@example.invalid",
};

async function rpc(handler: (request: Request) => Promise<Response>, method: string, params?: unknown) {
  const response = await handler(
    new Request("http://localhost:4105/api/v1/mcp", {
      method: "POST",
      headers: {
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
        "x-api-key": "test",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, ...(params ? { params } : {}) }),
    }),
  );
  const text = await response.text();
  const data = response.headers.get("content-type")?.includes("application/json")
    ? JSON.parse(text)
    : text
        .split("\n")
        .filter((line) => line.startsWith("data: "))
        .map((line) => JSON.parse(line.slice(6)) as Record<string, unknown>)
        .at(-1);

  return { response, data: data as { result?: Record<string, unknown>; error?: Record<string, unknown> } };
}

async function toolNames(handler: (request: Request) => Promise<Response>) {
  const listed = await rpc(handler, "tools/list");
  return ((listed.data.result?.tools ?? []) as Array<{ name: string }>).map((tool) => tool.name);
}

function handler() {
  return createMcpRoute({ workspace: [listUsersTool] }, [], "/api/v1/mcp", undefined, MCP_OPERATOR_TOOLS);
}

beforeEach(() => {
  state.integrationActor.mockReset().mockResolvedValue(null);
  state.interactiveActor.mockReset().mockResolvedValue(null);
  state.ledgerReads.mockReset().mockResolvedValue({ workspaces: [], intervals: [] });
});

describe("operator MCP tools", () => {
  it("keeps get_operator_usage out of tools/list for a caller who is not a platform operator", async () => {
    const names = await toolNames(handler());

    expect(names).toContain("list_users");
    expect(names).not.toContain("get_operator_usage");
  });

  it("refuses a direct call from a non-operator because the tool is not registered for them", async () => {
    const called = await rpc(handler(), "tools/call", { name: "get_operator_usage", arguments: { month: "2026-09" } });

    expect(called.data.result).toMatchObject({
      isError: true,
      content: [{ type: "text", text: expect.stringContaining("Tool get_operator_usage not found") }],
    });
    expect(state.ledgerReads).not.toHaveBeenCalled();
  });

  it("lists the tool for a platform operator and serves the usage through the shared interactor", async () => {
    state.integrationActor.mockResolvedValue(OPERATOR);
    const route = handler();

    expect(await toolNames(route)).toContain("get_operator_usage");

    const called = await rpc(route, "tools/call", { name: "get_operator_usage", arguments: { month: "2026-09" } });

    expect(called.data.result?.isError).toBeUndefined();
    expect(called.data.result?.structuredContent).toMatchObject({ month: "2026-09", workspaces: [] });
    expect(state.ledgerReads).toHaveBeenCalledOnce();
  });

  it("rejects the call server-side with the operator guard when access is revoked after listing", async () => {
    state.integrationActor.mockResolvedValueOnce(OPERATOR).mockResolvedValue(null);
    const route = handler();

    expect(await toolNames(route)).toContain("get_operator_usage");

    state.integrationActor.mockResolvedValueOnce(OPERATOR).mockResolvedValue(null);
    const called = await rpc(route, "tools/call", { name: "get_operator_usage", arguments: { month: "2026-09" } });

    expect(called.data.result).toMatchObject({
      isError: true,
      _meta: { failure: { kind: "authorization" } },
    });
    expect(state.ledgerReads).not.toHaveBeenCalled();
  });

  it("never exposes a write path in the operator toolset", () => {
    for (const tool of MCP_OPERATOR_TOOLS) {
      expect(tool.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
      expect(tool.name).toMatch(/^get_/);
    }
  });
});
