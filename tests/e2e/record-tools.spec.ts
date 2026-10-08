import { randomUUID } from "node:crypto";
import { z } from "zod";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ProviderConfigurationChangeSchema } from "../../features/records/configuration-provider.schema";
import { RecordDtoSchema, RecordModelSchema } from "../../features/records/record-model.schema";
import { RecordOperationResultSchema } from "../../features/records/record-query.schema";
import { RecordMeasureResultSchema } from "../../features/records/record-measure.schema";
import { ConfigurationPreviewSchema } from "../../features/records/configuration.schema";
import { ManageDataViewsResultSchema } from "../../features/data-view/manage-data-views.schema";
import { localE2eEnvironment } from "./local-environment";
import { test, expect, isAppConsoleError, isBenignPageError } from "./fixtures";
import { invokesServerAction, serverActionIds } from "./server-actions";

const DiscoverySchema = z.object({
  schemaRevision: z.number().int(),
  types: z.array(z.object({ id: z.uuid(), label: z.string(), pluralLabel: z.string() })),
});

test("configures a type, formula, saved view and widget over authenticated MCP and opens the persisted result in the UI", async ({
  context,
  page,
  database,
  companyId,
}, testInfo) => {
  const { baseUrl } = localE2eEnvironment();
  const keyResponse = await context.request.post(`${baseUrl}/api/auth/api-key/create`, {
    headers: { origin: baseUrl },
    data: { name: "Local record tool verification", expiresIn: 86400 },
  });
  expect(keyResponse.ok()).toBe(true);
  const credential = z.object({ id: z.string(), key: z.string() }).parse(await keyResponse.json());
  const client = new Client({ name: "local-record-verification", version: "2.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/api/v1/mcp`), {
    requestInit: { headers: { "x-api-key": credential.key } },
  });
  const call = async (name: string, arguments_: Record<string, unknown>) => {
    const result = await client.callTool({ name, arguments: arguments_ });
    expect(result.isError, `${name} returned a tool error`).not.toBe(true);
    expect(result.structuredContent, `${name} omitted structured content`).toBeDefined();
    return result.structuredContent;
  };
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    if (!isBenignPageError(error.message)) errors.push(error.message);
  });
  page.on("console", (message) => {
    if (isAppConsoleError(message)) errors.push(message.text());
  });
  try {
    await client.connect(transport);
    const catalog = await client.listTools();
    expect(catalog.tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining([
        "discover_record_types",
        "get_record_model",
        "configure_record_model",
        "mutate_crm_record",
        "manage_data_views",
        "manage_widgets",
      ]),
    );
    expect(catalog.tools.map((tool) => tool.name)).not.toContain("create_deal");
    const discovery = DiscoverySchema.parse(
      await call("discover_record_types", { includeEmbedded: false, page: 1, pageSize: 25 }),
    );
    const change = ProviderConfigurationChangeSchema.parse({
      expectedRevision: discovery.schemaRevision,
      idempotencyKey: randomUUID(),
      operations: [
        {
          operation: "createType",
          reference: "$projects",
          label: "Project",
          pluralLabel: "Projects",
          description: "Local protocol fixture",
          icon: "folder",
          embedded: false,
          accessPresetId: null,
        },
        {
          operation: "putField",
          field: {
            id: "$budget",
            typeId: "$projects",
            label: "Budget",
            valueType: "number",
            behavior: { kind: "input" },
            required: false,
            archived: false,
            options: [],
            position: 2,
          },
        },
        {
          operation: "putField",
          field: {
            id: "$half",
            typeId: "$projects",
            label: "Half budget",
            valueType: "number",
            behavior: {
              kind: "formula",
              expression: {
                root: "half",
                nodes: [
                  { id: "budget", kind: "field", fieldId: "$budget" },
                  { id: "factor", kind: "literal", value: { kind: "decimal", value: "0.5", currency: null } },
                  { id: "half", kind: "operation", operator: "multiply", argumentNodes: ["budget", "factor"] },
                ],
              },
            },
            required: false,
            archived: false,
            options: [],
            position: 3,
          },
        },
      ],
    });
    const preview = z
      .object({ action: z.literal("preview"), result: ConfigurationPreviewSchema })
      .parse(await call("configure_record_model", { action: "preview", change }));
    expect(preview.result.valid).toBe(true);
    const before = await database.query(
      'SELECT COUNT(*)::integer AS count FROM "RecordTypeDefinition" WHERE "companyId"=$1 AND "pluralLabel"=\'Projects\'',
      [companyId],
    );
    expect(before.rows).toEqual([{ count: 0 }]);
    const apply = async () =>
      z
        .object({ action: z.literal("apply"), result: RecordOperationResultSchema })
        .parse(await call("configure_record_model", { action: "apply", change }));
    const applied = await apply();
    expect(applied.result.status).toBe("completed");
    expect(await apply()).toEqual(applied);
    const projects = DiscoverySchema.parse(
      await call("discover_record_types", { search: "Projects", includeEmbedded: false, page: 1, pageSize: 25 }),
    );
    expect(projects.types).toHaveLength(1);
    const typeId = projects.types[0].id;
    const model = RecordModelSchema.parse(await call("get_record_model", { typeIds: [typeId] }));
    const type = model.types.find((type) => type.id === typeId)!;
    const budget = model.fields.find((field) => field.typeId === typeId && field.label === "Budget")!;
    const half = model.fields.find((field) => field.typeId === typeId && field.label === "Half budget")!;
    expect(budget).toBeDefined();
    expect(half).toBeDefined();
    const layoutChange = ProviderConfigurationChangeSchema.parse({
      expectedRevision: model.revision,
      idempotencyKey: randomUUID(),
      operations: [
        {
          operation: "putType",
          type: { ...type, defaults: { ...type.defaults, columns: [type.primaryFieldId, budget.id, half.id] } },
        },
      ],
    });
    const layoutPreview = z
      .object({ result: ConfigurationPreviewSchema })
      .parse(await call("configure_record_model", { action: "preview", change: layoutChange }));
    expect(layoutPreview.result.valid).toBe(true);
    const layout = z
      .object({ result: RecordOperationResultSchema })
      .parse(await call("configure_record_model", { action: "apply", change: layoutChange }));
    const revision = layout.result.schemaRevision;
    const created = z.object({ result: RecordOperationResultSchema }).parse(
      await call("mutate_crm_record", {
        expectedRevision: revision,
        idempotencyKey: randomUUID(),
        mutation: {
          action: "create",
          typeId,
          fields: [
            { fieldId: type.primaryFieldId, value: { kind: "text", value: "Protocol project" } },
            { fieldId: budget.id, value: { kind: "decimal", value: "68.5", currency: null } },
          ],
        },
      }),
    );
    if (created.result.status !== "completed") throw new Error("The protocol record was not completed");
    const ref = created.result.refs[0];
    const record = RecordDtoSchema.parse(await call("read_crm_record", ref));
    expect(record.fields.find((field) => field.fieldId === half.id)?.result).toEqual({
      state: "value",
      value: { kind: "decimal", value: "34.25", currency: null },
    });
    await call("manage_data_views", { action: "config", surfaceKey: `records:${typeId}`, section: "overview" });
    const view = ManageDataViewsResultSchema.parse(
      await call("manage_data_views", {
        action: "create",
        surfaceKey: `records:${typeId}`,
        name: "Protocol projects",
        state: { searchTerm: "Protocol project" },
      }),
    );
    const measure = { source: { typeId }, aggregation: "sum", valueFieldId: half.id, groupBy: null };
    const result = RecordMeasureResultSchema.parse(await call("query_crm_measure", measure));
    expect(result.total).toEqual({
      count: 1,
      result: { state: "value", value: { kind: "decimal", value: "34.25", currency: null } },
    });
    await call("manage_widgets", {
      action: "create",
      name: "Protocol half budgets",
      expectedRevision: revision,
      idempotencyKey: randomUUID(),
      measure,
      displayOptions: { displayType: "verticalBarChart", showLegend: true },
    });
    const unreadIds = serverActionIds("app/[locale]/(protected)/inbox/actions.ts", "getUnreadThreadCountAction");
    const unreadCountSettled = page.waitForResponse((response) => invokesServerAction(response.request(), unreadIds));
    await page.goto(`/en${view.link}`);
    await expect(page.getByRole("link", { name: "Protocol project", exact: true })).toBeVisible();
    await expect(
      page.locator("#global-data-views").getByRole("link", { name: "Protocol projects", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("columnheader", { name: "Half budget", exact: false })).toBeVisible();
    await expect(page.getByRole("cell", { name: "34.25", exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("mcp-configured-projects.png"), animations: "disabled" });
    await unreadCountSettled;
    await page.waitForLoadState("networkidle");
    await page.goto("/en/dashboard");
    const widget = page
      .locator('[data-uid="app-card"]')
      .filter({ has: page.getByRole("heading", { name: "Protocol half budgets", exact: true }) });
    await expect(widget.getByText("Overall: 34.25", { exact: true })).toBeVisible();
    const persisted = await database.query(
      'SELECT "fieldId",trim_scale("decimalValue")::text AS value FROM "RecordValue" WHERE "companyId"=$1 AND "typeId"=$2 AND "recordId"=$3 AND "fieldId"=ANY($4::text[]) ORDER BY "fieldId"',
      [companyId, typeId, ref.recordId, [budget.id, half.id]],
    );
    expect(persisted.rows).toEqual(
      [
        { fieldId: budget.id, value: "68.5" },
        { fieldId: half.id, value: "34.25" },
      ].sort((a, b) => a.fieldId.localeCompare(b.fieldId)),
    );
    expect(errors).toEqual([]);
  } finally {
    await client.close();
    await database.query('DELETE FROM "Apikey" WHERE id=$1', [credential.id]);
  }
});
