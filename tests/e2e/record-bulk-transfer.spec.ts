import { randomUUID } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { z } from "zod";

import { mintApiKey } from "./api-key";
import { localE2eEnvironment } from "./local-environment";
import { presetId } from "../../features/records/crm-preset";
import { postOk, readModel } from "./api";
import { expect, test } from "./fixtures";

test("imports sparse rows in batches, patches them per record with links and unlinks, and exports them page by page over the API", async ({
  page,
  database,
  companyId,
}) => {
  test.setTimeout(180000);
  await page.goto("/en/dashboard");
  const model = await readModel(database, companyId);
  const contactType = presetId(companyId, "contact");
  const organizationType = presetId(companyId, "organization");
  const relationId = presetId(companyId, "contact.organizations");
  const firstName = presetId(companyId, "contact.firstName");
  const lastName = presetId(companyId, "contact.lastName");
  const text = (fieldId: string, value: string) => ({
    fieldId,
    result: { state: "value", value: { kind: "text", value } },
  });
  const contact = (recordId: string) => ({ typeId: contactType, recordId });
  const organization = (recordId: string) => ({ typeId: organizationType, recordId });
  const document = (typeId: string, records: unknown[], extra: Record<string, unknown> = {}) => ({
    format: "customermates-records",
    version: 1,
    typeId,
    schemaRevision: model.revision,
    records,
    ...extra,
  });
  const contactCount = async () =>
    Number(
      (
        await database.query('SELECT count(*) FROM "CrmRecord" WHERE "companyId"=$1 AND "typeId"=$2', [
          companyId,
          contactType,
        ])
      ).rows[0].count,
    );

  const [oldOrganization, newOrganization] = [randomUUID(), randomUUID()];
  await postOk(page, "/api/v1/records/import", {
    mode: "create",
    idempotencyKey: randomUUID(),
    document: document(
      organizationType,
      [oldOrganization, newOrganization].map((recordId, index) => ({
        ref: organization(recordId),
        fields: [text(presetId(companyId, "organization.name"), `Bulk organization ${index}`)],
      })),
    ),
  });

  const before = await contactCount();
  const contacts = Array.from({ length: 150 }, () => randomUUID());
  for (const [batchIndex, batch] of [contacts.slice(0, 100), contacts.slice(100)].entries()) {
    const request = {
      mode: "create",
      idempotencyKey: `bulk-transfer-${batchIndex}-${randomUUID()}`,
      document: document(
        contactType,
        batch.map((recordId, index) => ({
          ref: contact(recordId),
          fields: [text(firstName, `Bulkperson ${batchIndex * 100 + index}`)],
        })),
        {
          links: batch.map((recordId) => ({
            relationId,
            source: contact(recordId),
            target: organization(oldOrganization),
          })),
        },
      ),
    };
    const first = await postOk(page, "/api/v1/records/import", request);
    expect(first).toMatchObject({ created: batch.length, updated: 0, linked: batch.length });
    expect(await postOk(page, "/api/v1/records/import", request)).toEqual(first);
  }
  expect(await contactCount()).toBe(before + 150);

  const tooMany = await page.request.post("/api/v1/records/import", {
    data: {
      mode: "create",
      idempotencyKey: randomUUID(),
      document: document(
        contactType,
        Array.from({ length: 101 }, () => ({ ref: contact(randomUUID()), fields: [text(firstName, "Over")] })),
      ),
    },
  });
  expect(tooMany.status()).not.toBe(200);
  const invalidRow = await page.request.post("/api/v1/records/import", {
    data: {
      mode: "create",
      idempotencyKey: randomUUID(),
      document: document(contactType, [
        { ref: contact(randomUUID()), fields: [text(firstName, "Valid")] },
        { ref: contact(randomUUID()), fields: [text(randomUUID(), "Unknown field")] },
      ]),
    },
  });
  expect(invalidRow.status()).not.toBe(200);
  expect(await contactCount()).toBe(before + 150);

  const patched = await postOk(page, "/api/v1/records/import", {
    mode: "update",
    idempotencyKey: randomUUID(),
    document: document(
      contactType,
      contacts.slice(0, 3).map((recordId, index) => ({
        ref: contact(recordId),
        fields: [text(lastName, `Patched ${index}`)],
      })),
      {
        links: [{ relationId, source: contact(contacts[0]), target: organization(newOrganization) }],
        unlinks: [{ relationId, source: contact(contacts[0]), target: organization(oldOrganization) }],
      },
    ),
  });
  expect(patched).toMatchObject({ created: 0, updated: 3, linked: 1, unlinked: 1 });
  const links = await database.query(
    'SELECT "targetId" FROM "RecordLink" WHERE "companyId"=$1 AND "relationId"=$2 AND "sourceId"=$3 AND "deletedAt" IS NULL',
    [companyId, relationId, contacts[0]],
  );
  expect(links.rows.map((row) => row.targetId)).toEqual([newOrganization]);

  const exportPage = (pageNumber: number) =>
    postOk(page, "/api/v1/records/export", {
      typeId: contactType,
      search: "Bulkperson",
      filters: [],
      relationships: [],
      sort: [{ fieldId: "system:createdAt", direction: "asc" }],
      page: pageNumber,
      pageSize: 100,
    });
  const firstPage = await exportPage(1);
  const secondPage = await exportPage(2);
  expect(firstPage).toMatchObject({ total: 150, nextPage: 2 });
  expect(secondPage).toMatchObject({ total: 150, nextPage: null });
  const exported = [...firstPage.records, ...secondPage.records].filter(
    (row: { ref: { typeId: string } }) => row.ref.typeId === contactType,
  );
  expect(new Set(exported.map((row: { ref: { recordId: string } }) => row.ref.recordId))).toEqual(new Set(contacts));
  const patchedRow = exported.find((row: { ref: { recordId: string } }) => row.ref.recordId === contacts[1]);
  expect(patchedRow.fields).toEqual(
    expect.arrayContaining([
      { fieldId: lastName, result: { state: "value", value: { kind: "text", value: "Patched 1" } } },
      { fieldId: firstName, result: { state: "value", value: { kind: "text", value: "Bulkperson 1" } } },
    ]),
  );
});

test("import_crm_records and export_crm_records accept sparse rows and pages over MCP", async ({
  page,
  database,
  workspace,
  companyId,
}) => {
  await page.goto("/en/dashboard");
  const model = await readModel(database, companyId);
  const contactType = presetId(companyId, "contact");
  const firstName = presetId(companyId, "contact.firstName");
  const lastName = presetId(companyId, "contact.lastName");
  const recordId = randomUUID();
  const ref = { typeId: contactType, recordId };
  const text = (fieldId: string, value: string) => ({
    fieldId,
    result: { state: "value", value: { kind: "text", value } },
  });
  const { key } = await mintApiKey(database, workspace, "Bulk transfer over MCP");
  const client = new Client({ name: "bulk-transfer", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(`${localE2eEnvironment().baseUrl}/api/v1/mcp`), {
    requestInit: { headers: { "x-api-key": key } },
  });
  const importRows = (mode: "create" | "update", fields: unknown[]) =>
    client.callTool({
      name: "import_crm_records",
      arguments: {
        mode,
        idempotencyKey: randomUUID(),
        document: {
          format: "customermates-records",
          version: 1,
          typeId: contactType,
          schemaRevision: model.revision,
          records: [{ ref, fields }],
        },
      },
    });

  try {
    await client.connect(transport);
    const tools = await client.listTools();
    const importTool = tools.tools.find((tool) => tool.name === "import_crm_records");
    expect(JSON.stringify(importTool?.inputSchema)).toContain("unlinks");

    const created = await importRows("create", [text(firstName, "Mcp")]);
    expect(created.isError, JSON.stringify(created.content)).not.toBe(true);
    expect(created.structuredContent).toMatchObject({ created: 1 });
    const updated = await importRows("update", [text(lastName, "Sparse")]);
    expect(updated.isError, JSON.stringify(updated.content)).not.toBe(true);
    expect(updated.structuredContent).toMatchObject({ updated: 1 });

    const exported = await client.callTool({
      name: "export_crm_records",
      arguments: { typeId: contactType, search: "Mcp Sparse", page: 1, pageSize: 10 },
    });
    expect(exported.isError, JSON.stringify(exported.content)).not.toBe(true);
    const output = z
      .object({
        total: z.number(),
        nextPage: z.number().nullable(),
        records: z.array(z.object({ ref: z.object({ recordId: z.string() }), fields: z.array(z.unknown()) })),
      })
      .parse(exported.structuredContent);
    expect(output).toMatchObject({ total: 1, nextPage: null });
    expect(output.records[0]?.ref.recordId).toBe(recordId);
    expect(output.records[0]?.fields).toEqual(
      expect.arrayContaining([
        { fieldId: firstName, result: { state: "value", value: { kind: "text", value: "Mcp" } } },
        { fieldId: lastName, result: { state: "value", value: { kind: "text", value: "Sparse" } } },
      ]),
    );
  } finally {
    await client.close();
  }
});
