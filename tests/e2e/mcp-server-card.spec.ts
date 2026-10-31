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

  const denied = await request.post("/api/v1/mcp", {
    data: { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
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

test("the footer uses the official Open Source Alternatives image and link", async ({ page }) => {
  await page.goto("/en/contact");
  const badge = page.locator('a[href="https://www.opensourcealternatives.to"]').first();
  if (process.env.APP_MODE === "self-hosted") {
    await expect(badge).toHaveCount(0);
    return;
  }
  await expect(badge).toHaveAttribute("rel", "noopener noreferrer");
  const image = badge.locator('img[src="https://www.opensourcealternatives.to/badge-osa.svg"]').first();
  await expect(image).toHaveAttribute("width", "270");
  await expect(image).toHaveAttribute("height", "20");
  await expect(image).toHaveAttribute("alt", /Open Source Alternatives/);
});
