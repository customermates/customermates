import { randomUUID } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { z } from "zod";

import { localE2eEnvironment } from "./local-environment";
import { test, expect, collectPageErrors } from "./fixtures";

test("unified MCP search validates guide, procedure and knowledge results in the SDK client", async ({
  context,
  page,
  database,
  companyId,
}) => {
  const errors = collectPageErrors(page);
  const { baseUrl } = localE2eEnvironment();
  for (const [title, kind, whenToUse] of [
    ["Operating Guide", "guide", null],
    ["Sales Process", "procedure", "Use when qualifying a lead"],
    ["Product Fact Sheet", "knowledge", null],
  ] as const) {
    await database.query(
      'INSERT INTO "WikiPage" (id,"companyId",title,markdown,kind,"whenToUse","updatedAt") VALUES ($1,$2,$3,$4,$5::"WikiPageKind",$6,NOW())',
      [randomUUID(), companyId, title, `${title} explains this workspace.`, kind, whenToUse],
    );
  }

  const keyResponse = await context.request.post(`${baseUrl}/api/auth/api-key/create`, {
    headers: { origin: baseUrl },
    data: { name: "Unified search output contract", expiresIn: 86400 },
  });
  expect(keyResponse.ok()).toBe(true);
  const { key } = z.object({ key: z.string() }).parse(await keyResponse.json());
  const client = new Client({ name: "unified-search-contract", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/api/v1/mcp`), {
    requestInit: { headers: { "x-api-key": key } },
  });

  try {
    await client.connect(transport);
    await client.listTools();
    for (const [title, kind] of [
      ["Operating Guide", "guide"],
      ["Sales Process", "procedure"],
      ["Product Fact Sheet", "knowledge"],
    ] as const) {
      const result = await client.callTool({ name: "search", arguments: { query: title } });
      expect(result.isError).not.toBe(true);
      const output = z
        .object({ results: z.array(z.object({ title: z.string(), kind: z.string().optional() })) })
        .parse(result.structuredContent);
      expect(output.results).toEqual(expect.arrayContaining([expect.objectContaining({ title })]));
      const own = output.results.find((item) => item.title === title);
      expect(own?.kind).toBe(kind === "knowledge" ? undefined : kind);
    }
    expect(errors).toEqual([]);
  } finally {
    await client.close();
  }
});
