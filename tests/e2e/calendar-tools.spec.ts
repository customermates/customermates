import { randomUUID } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import { ManageCalendarResultSchema } from "../../features/planner/manage-calendar.schema";
import { mintApiKey } from "./api-key";
import { localE2eEnvironment } from "./local-environment";
import { test, expect, collectPageErrors } from "./fixtures";
import { presetId } from "../../features/records/crm-preset";
import { postOk, readModel } from "./api";

test("an agent sets the Calendar page over MCP, the page shows it, and reset returns to the derived default", async ({
  page,
  database,
  workspace,
  companyId,
}) => {
  test.setTimeout(180000);
  const errors = collectPageErrors(page);
  const typeId = presetId(companyId, "organization");
  const dueOn = randomUUID();
  const model = await readModel(database, companyId);
  await postOk(page, "/api/v1/model/apply", {
    expectedRevision: model.revision,
    idempotencyKey: randomUUID(),
    operations: [
      {
        operation: "putField",
        field: {
          id: dueOn,
          typeId,
          label: "Due on",
          valueType: "date",
          required: false,
          multiple: false,
          behavior: { kind: "input" },
          archived: false,
          options: [],
          position: 100,
        },
      },
    ],
  });
  const today = new Date().toISOString().slice(0, 10);
  const created = await postOk(page, "/api/v1/records/mutate", {
    expectedRevision: (await readModel(database, companyId)).revision,
    idempotencyKey: randomUUID(),
    mutation: {
      action: "create",
      typeId,
      fields: [
        { fieldId: presetId(companyId, "organization.name"), value: { kind: "text", value: "Renewal call" } },
        { fieldId: dueOn, value: { kind: "date", value: today } },
      ],
    },
  });

  const credential = await mintApiKey(database, workspace, "Calendar tool verification");
  const client = new Client({ name: "calendar-tool-verification", version: "1.0.0" });
  const call = async (arguments_: Record<string, unknown>) => {
    const result = await client.callTool({ name: "manage_calendar", arguments: arguments_ });
    expect(result.isError, JSON.stringify(result.content)).not.toBe(true);
    return ManageCalendarResultSchema.parse(result.structuredContent);
  };
  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`${localE2eEnvironment().baseUrl}/api/v1/mcp`), {
        requestInit: { headers: { "x-api-key": credential.key } },
      }),
    );
    const options = await call({ action: "options" });
    const list = options.lists?.find((item) => item.typeId === typeId);
    expect(list?.dateFields).toEqual([{ id: dueOn, label: "Due on", valueType: "date" }]);
    const initial = await call({ action: "read" });
    expect(initial.saved).toBe(false);
    expect(initial.config?.sources).toContainEqual(expect.objectContaining({ typeId, calendar: { dateFieldId: dueOn } }));

    const updated = await call({
      action: "update",
      config: {
        sources: [{ typeId, calendar: { dateFieldId: dueOn }, color: "success" }],
        timeZone: "Europe/Berlin",
        mode: "month",
      },
    });
    expect(updated).toMatchObject({ saved: true, config: { timeZone: "Europe/Berlin", mode: "month" } });
    const sourceId = updated.config?.sources[0]?.id;
    expect(updated.config?.sources).toHaveLength(1);

    await page.goto("/en/calendar");
    const calendar = page.locator("[data-planner-page]");
    await expect(calendar).toBeVisible();
    await expect(
      calendar.locator(`[data-calendar-entry="${sourceId}:${created.refs[0].recordId}"]`).first(),
    ).toBeVisible();
    await page.getByRole("button", { name: "Date sources", exact: true }).click();
    const sources = page.getByRole("dialog", { name: "Date sources", exact: true });
    await expect(sources.locator("[data-planner-source]")).toHaveCount(1);
    await expect(sources.getByRole("checkbox", { name: "Organizations · Due on", exact: true })).toBeChecked();
    await sources.getByRole("button", { name: "Close", exact: true }).click();

    const reset = await call({ action: "reset" });
    expect(reset).toMatchObject({ saved: false, config: initial.config });
    await page.reload();
    await page.getByRole("button", { name: "Date sources", exact: true }).click();
    await expect(sources.locator("[data-planner-source]")).toHaveCount(initial.config?.sources.length ?? 0);
    const saved = await database.query(
      'SELECT settings FROM "P13n" WHERE "companyId"=$1 AND "userId"=$2 AND "p13nId"=$3',
      [companyId, workspace.userId, "combined-calendar"],
    );
    expect(saved.rows[0]?.settings ?? null).toBeNull();
    expect(errors).toEqual([]);
  } finally {
    await client.close();
  }
});
