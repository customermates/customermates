import { beforeEach, describe, expect, it, vi } from "vitest";

import { ALL_VIEW_KEY, SURFACE } from "@/core/data-view/data-view-keys";

const interactors = vi.hoisted(() => ({ manage: vi.fn() }));

vi.mock("@/env", () => ({ env: { BASE_URL: "http://localhost:4105" } }));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("@/core/validation/zod-error-map-server", () => ({
  getZodParseContext: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/core/di", () => ({
  getManageDataViewsInteractor: () => ({ invoke: interactors.manage }),
}));

import { POST } from "../route";

const URL = "http://localhost:4105/api/v1/mcp?toolsets=views";
const state = {
  filters: [{ field: "dealIds", operator: "hasSome" }],
  viewMode: "card" as const,
};
const input = {
  action: "update" as const,
  surfaceKey: SURFACE.contacts,
  viewKey: ALL_VIEW_KEY,
  state,
};
const output = {
  ...input,
  link: `/contacts?view=${ALL_VIEW_KEY}`,
};

type RpcResponse = {
  result?: {
    tools?: Array<{ name?: string }>;
    structuredContent?: Record<string, unknown>;
    isError?: boolean;
  };
};

let handler: typeof POST;

async function rpc(body: Record<string, unknown>, sessionId?: string) {
  const response = await handler(
    new Request(URL, {
      method: "POST",
      headers: {
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
        "x-api-key": "test-transport-only",
        ...(sessionId ? { "mcp-session-id": sessionId } : {}),
      },
      body: JSON.stringify(body),
    }),
  );
  const text = await response.text();
  const data: RpcResponse | undefined = response.headers.get("content-type")?.includes("application/json")
    ? JSON.parse(text)
    : text
        .split("\n")
        .filter((line) => line.startsWith("data: "))
        .map((line) => JSON.parse(line.slice(6)) as RpcResponse)
        .at(-1);
  return { response, data };
}

beforeEach(() => {
  vi.resetAllMocks();
  handler = POST;
  interactors.manage.mockResolvedValue({ ok: true, data: output });
});

describe("saved-view MCP HTTP transport", () => {
  it("selects the views toolset and carries a validated view update through the public transport", async () => {
    const initialized = await rpc({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "data-view-transport-test", version: "1" },
      },
    });
    expect(initialized.response.status).toBe(200);
    const sessionId = initialized.response.headers.get("mcp-session-id") ?? undefined;
    if (sessionId) await rpc({ jsonrpc: "2.0", method: "notifications/initialized" }, sessionId);

    const listed = await rpc({ jsonrpc: "2.0", id: 2, method: "tools/list" }, sessionId);
    const toolNames = listed.data?.result?.tools?.map(({ name }) => name);
    expect(toolNames?.toSorted()).toEqual(["fetch", "manage_data_views", "search"]);

    const called = await rpc(
      {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "manage_data_views", arguments: input },
      },
      sessionId,
    );

    expect(interactors.manage).toHaveBeenCalledExactlyOnceWith(input);
    expect(called.data?.result?.structuredContent).toEqual(output);
    expect(called.data?.result?.isError).not.toBe(true);
  });
});
