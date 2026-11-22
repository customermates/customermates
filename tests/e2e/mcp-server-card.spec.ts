import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import { test, expect } from "./fixtures";
import { mintApiKey } from "./api-key";
import { localE2eEnvironment } from "./local-environment";

test("public discovery matches the authenticated MCP definitions without granting anonymous tool access", async ({
  request,
  database,
  workspace,
}) => {
  const response = await request.get("/.well-known/mcp/server-card.json");
  expect(response.status()).toBe(200);
  const card = await response.json();
  expect(card.authentication).toEqual({ required: true, schemes: ["oauth2", "apiKey"] });
  expect(card.tools.length).toBeGreaterThan(0);
  expect(card.tools.every((tool: Record<string, unknown>) => !("execute" in tool))).toBe(true);

  const anonymous = new Client({ name: "anonymous-discovery", version: "1.0.0" });
  try {
    await anonymous.connect(new StreamableHTTPClientTransport(new URL("/api/v1/mcp", localE2eEnvironment().baseUrl)));
    expect(anonymous.getServerVersion()).toEqual(card.serverInfo);
    const { tools } = await anonymous.listTools();
    expect(tools.length).toBeGreaterThan(0);
    for (const tool of tools) expect(card.tools.find((definition: { name: string }) => definition.name === tool.name)).toEqual(tool);
  } finally {
    await anonymous.close();
  }

  const denied = await request.post("/api/v1/mcp", {
    headers: { accept: "application/json, text/event-stream" },
    data: {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "get_workspace_context", arguments: {} },
    },
  });
  expect(denied.status()).toBe(401);
  expect(denied.headers()["www-authenticate"]).toContain("resource_metadata");

  const { key } = await mintApiKey(database, workspace, "Public discovery parity");
  const client = new Client({ name: "discovery-verification", version: "1.0.0" });
  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL("/api/v1/mcp", localE2eEnvironment().baseUrl), {
        requestInit: { headers: { "x-api-key": key } },
      }),
    );
    expect(client.getServerVersion()).toEqual(card.serverInfo);
    const { tools } = await client.listTools();
    for (const tool of tools) expect(card.tools.find((definition: { name: string }) => definition.name === tool.name)).toEqual(tool);
    expect((await client.listPrompts()).prompts).toEqual(card.prompts);
  } finally {
    await client.close();
  }
});

test("the footer no longer links the Open Source Alternatives listing", async ({ page }) => {
  await page.goto("/en/contact");
  await expect(page.locator("footer")).toBeVisible();
  await expect(page.locator('a[href^="https://www.opensourcealternatives.to"]')).toHaveCount(0);
});
