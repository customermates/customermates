import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockUser } from "@/tests/helpers/mock-user";
import { createMockDiModule, MOCK_ZOD_MODULE } from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();
const mockEnv = vi.hoisted(() => ({
  APP_MODE: "self-hosted" as "cloud" | "self-hosted",
  BASE_URL: "http://localhost:4105",
  NODE_ENV: "test",
}));

vi.mock("@/env", () => ({ env: mockEnv }));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("next-intl/server", () => ({
  getTranslations: () => Promise.resolve({ raw: (key: string) => key }),
}));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/core/di", () => ({
  ...createMockDiModule(() => mockUser),
  getAuthService: () => ({ isMcpApiKeyValid: () => Promise.resolve(true) }),
  getAuthorizeMcpConnectionInteractor: () => ({ invoke: () => Promise.resolve({ ok: true, data: true }) }),
}));

const CLOUD_ONLY_TOOLS = [
  "get_messaging_threads",
  "get_calendars",
  "send_chat_message",
  "send_email",
  "save_message_draft",
  "discard_message_draft",
  "update_messaging_thread",
  "move_email_thread",
  "manage_conversation_records",
  "connect_messaging_account",
  "manage_connected_accounts",
  "get_social_posts",
  "get_social_post_engagement",
  "get_social_profile",
  "manage_social_relations",
  "linkedin_search_sales_leads",
  "linkedin_search_sales_companies",
  "linkedin_get_sales_search_parameters",
  "linkedin_manage_sales_lists",
  "manage_routines",
];

function requestBody(method: string, id: number, params?: Record<string, unknown>) {
  return {
    jsonrpc: "2.0",
    id,
    method,
    params:
      method === "initialize"
        ? {
            protocolVersion: "2025-03-26",
            capabilities: {},
            clientInfo: { name: "self-hosted-tools-test", version: "1" },
          }
        : (params ?? {}),
  };
}

async function rpc(handler: (request: Request) => Promise<Response>, body: Record<string, unknown>) {
  const response = await handler(
    new Request("http://localhost:4105/api/v1/mcp", {
      method: "POST",
      headers: {
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
        "x-api-key": "test",
      },
      body: JSON.stringify(body),
    }),
  );
  const text = await response.text();
  return text
    .split("\n")
    .filter((line) => line.startsWith("data: "))
    .map((line) => JSON.parse(line.slice(6)) as { result?: Record<string, unknown>; error?: { message: string } })
    .at(-1);
}

async function listedToolNames(handler: (request: Request) => Promise<Response>) {
  const listed = await rpc(handler, requestBody("tools/list", 2));
  return ((listed?.result?.tools ?? []) as { name: string }[]).map((tool) => tool.name);
}

describe("the MCP endpoint", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("does not list or run the cloud-only tools on a self-hosted instance", async () => {
    mockEnv.APP_MODE = "self-hosted";
    const { POST } = await import("../route");

    const names = await listedToolNames(POST);

    expect(names).toEqual(expect.arrayContaining(["get_activities", "query_crm_records", "manage_webhooks"]));
    for (const name of CLOUD_ONLY_TOOLS) expect(names, name).not.toContain(name);

    const called = await rpc(POST, requestBody("tools/call", 3, { name: "manage_routines", arguments: {} }));
    expect(JSON.stringify(called)).toContain("Tool manage_routines not found");
  }, 60_000);

  it("introduces itself as Customermates", async () => {
    const { POST } = await import("../route");

    const initialized = await rpc(POST, requestBody("initialize", 1));

    expect(initialized?.result?.serverInfo).toMatchObject({ name: "Customermates" });
  }, 60_000);

  it("keeps every tool on cloud", async () => {
    mockEnv.APP_MODE = "cloud";
    const { POST } = await import("../route");

    expect(await listedToolNames(POST)).toEqual(expect.arrayContaining(CLOUD_ONLY_TOOLS));
  }, 60_000);
});
