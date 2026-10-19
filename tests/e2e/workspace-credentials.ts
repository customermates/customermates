import type { PlaywrightWorkerArgs } from "@playwright/test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { z } from "zod";

import { expect } from "./fixtures";
import { localE2eEnvironment } from "./local-environment";

export async function mcpWorkspaceName(key: string) {
  const { baseUrl } = localE2eEnvironment();
  const client = new Client({ name: "workspace-credentials", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/api/v1/mcp`), {
    requestInit: { headers: { "x-api-key": key } },
  });
  try {
    await client.connect(transport);
    const result = await client.callTool({ name: "get_workspace_context", arguments: {} });
    expect(result.isError).not.toBe(true);
    const { company } = z
      .looseObject({ company: z.looseObject({ id: z.string(), name: z.string().nullable() }) })
      .parse(result.structuredContent);
    return { id: company.id, name: company.name };
  } finally {
    await client.close();
  }
}

export async function restPost(
  playwright: PlaywrightWorkerArgs["playwright"],
  key: string,
  path: string,
  data: unknown,
) {
  const api = await playwright.request.newContext({
    baseURL: localE2eEnvironment().baseUrl,
    extraHTTPHeaders: { "x-api-key": key },
  });
  try {
    const response = await api.post(`/api${path}`, { data });
    return { status: response.status(), body: (await response.json().catch(() => null)) as unknown };
  } finally {
    await api.dispose();
  }
}
