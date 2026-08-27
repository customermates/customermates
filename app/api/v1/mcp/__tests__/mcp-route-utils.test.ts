import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { createZodError } from "@/core/validation/validation.utils";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { manageCustomColumnsTool } from "@/features/mcp-tools/custom-column.mcp-tools";
import { mcpInteractorFailure, type McpTool } from "@/features/mcp-tools/mcp-tool";

const sentry = vi.hoisted(() => ({ captureException: vi.fn() }));

vi.mock("@sentry/nextjs", () => sentry);
vi.mock("@/env", () => ({ env: { BASE_URL: "http://localhost:4105" } }));
vi.mock("@/core/di", () => ({
  getUpsertCustomColumnInteractor: vi.fn(),
  getGetCustomColumnsInteractor: vi.fn(),
  getGetCustomColumnsByEntityTypeInteractor: vi.fn(),
  getDeleteCustomColumnInteractor: vi.fn(),
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
      createZodError("Service missing", ["id"], {
        error: CustomErrorCode.serviceNotFound,
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

async function rpc(
  handler: (request: Request) => Promise<Response>,
  body: Record<string, unknown>,
  sessionId?: string,
) {
  const response = await handler(
    new Request("http://localhost:4105/api/v1/mcp?toolsets=test", {
      method: "POST",
      headers: {
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
        "x-api-key": "test",
        ...(sessionId ? { "mcp-session-id": sessionId } : {}),
      },
      body: JSON.stringify(body),
    }),
  );
  const text = await response.text();
  const data = text
    .split("\n")
    .filter((line) => line.startsWith("data: "))
    .map((line) => JSON.parse(line.slice(6)) as Record<string, unknown>)
    .at(-1);
  return { response, data, text };
}

describe("public MCP execution boundary", () => {
  it("round-trips structured expected failures and redacts unexpected failures", async () => {
    const handler = createMcpRoute({
      test: [expectedFailureTool, unexpectedFailureTool, manageCustomColumnsTool],
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
    const customColumnsDefinition = tools.find((tool) => tool.name === "manage_custom_columns");
    const customColumnsInput = customColumnsDefinition?.inputSchema as
      | { properties?: Record<string, unknown> }
      | undefined;
    expect(customColumnsInput?.properties?.selectOptions).toMatchObject({ type: "array", minItems: 1 });
    expect(JSON.stringify(customColumnsInput?.properties?.id)).toContain('"null"');

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
              customCode: "serviceNotFound",
              message: "Service missing",
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
    expect(unexpected.data?.result).toMatchObject({ isError: true });
    expect(unexpected.text).toContain("The operation could not be completed");
    expect(unexpected.text).not.toContain("db-password");
    expect(sentry.captureException).toHaveBeenCalledTimes(1);
    const captured = sentry.captureException.mock.calls[0]?.[0];
    expect(captured).toMatchObject({ message: "The MCP tool could not be completed." });
    expect((captured as Error).cause).toBeUndefined();
    expect(captured).not.toBe(unexpectedFailure);
    expect((captured as Error).stack).not.toContain("must-not-leak");
  });
});
