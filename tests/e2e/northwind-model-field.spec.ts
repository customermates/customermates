import { randomUUID } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { z } from "zod";

import { localE2eEnvironment } from "./local-environment";
import { DEMO_COMPANY_ID, demoId, expect, test } from "./demo-seed";

test("adds an optional choice field to the Northwind model through REST and MCP", async ({
  page,
  database,
  errors,
}) => {
  const { baseUrl } = localE2eEnvironment();
  const typeId = demoId("organization");
  const size = await database.query<{ count: number }>(
    'SELECT count(*)::int AS count FROM "CrmRecord" WHERE "companyId"=$1',
    [DEMO_COMPANY_ID],
  );
  expect(size.rows[0].count).toBeGreaterThanOrEqual(456);
  const state = await database.query<{ revision: number }>(
    'SELECT revision FROM "RecordSchemaState" WHERE "companyId"=$1',
    [DEMO_COMPANY_ID],
  );
  const change = {
    expectedRevision: state.rows[0].revision,
    idempotencyKey: randomUUID(),
    operations: [
      {
        operation: "putField",
        field: {
          id: "$pbRenewalRisk",
          typeId,
          label: "PB renewal risk",
          valueType: "select",
          behavior: { kind: "input" },
          required: false,
          multiple: false,
          options: [
            { id: "low", label: "Low", color: "success", attributes: [] },
            { id: "medium", label: "Medium", color: "warning", attributes: [] },
            { id: "high", label: "High", color: "destructive", attributes: [] },
          ],
          position: 20,
        },
      },
    ],
  };
  const preview = await page.request.post(`${baseUrl}/api/v1/model/preview`, { data: change });
  expect(preview.ok(), await preview.text()).toBe(true);
  expect(await preview.json()).toMatchObject({ valid: true, execution: "synchronous", affectedRecords: 0 });

  const keyResponse = await page.request.post(`${baseUrl}/api/auth/api-key/create`, {
    headers: { origin: baseUrl },
    data: { name: "Northwind model field verification", expiresIn: 86400 },
  });
  expect(keyResponse.ok(), await keyResponse.text()).toBe(true);
  const credential = z.object({ key: z.string() }).parse(await keyResponse.json());
  const client = new Client({ name: "northwind-model-field-verification", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/api/v1/mcp`), {
    requestInit: { headers: { "x-api-key": credential.key } },
  });
  try {
    await client.connect(transport);
    const applied = await client.callTool({ name: "configure_record_model", arguments: { action: "apply", change } });
    expect(applied.isError).not.toBe(true);
    expect(applied.structuredContent).toMatchObject({ action: "apply", result: { status: "completed" } });
    const replay = await page.request.post(`${baseUrl}/api/v1/model/apply`, { data: change });
    expect(replay.ok(), await replay.text()).toBe(true);
    expect(await replay.json()).toMatchObject({ status: "completed" });
    const fields = await database.query<{ label: string }>(
      "SELECT definition->>'label' AS label FROM \"RecordFieldDefinition\" WHERE \"companyId\"=$1 AND \"typeId\"=$2 AND definition->>'label'='PB renewal risk'",
      [DEMO_COMPANY_ID, typeId],
    );
    expect(fields.rows).toEqual([{ label: "PB renewal risk" }]);
  } finally {
    await client.close();
  }
  expect(errors).toEqual([]);
});
