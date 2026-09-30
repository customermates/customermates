import { randomUUID } from "node:crypto";
import { test, expect } from "./fixtures";

test("creates a custom list and field through the UI, then persists a decimal record across reloads", async ({
  page,
  database,
  companyId,
}, testInfo) => {
  test.setTimeout(240000);
  const errors: string[] = [];
  const resizeNotices: string[] = [];
  page.on("pageerror", (error) => {
    if (error.message === "ResizeObserver loop completed with undelivered notifications.") {
      resizeNotices.push(page.url());
    } else errors.push(error.message);
  });
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  const name = `Projects ${randomUUID().slice(0, 8)}`;
  const recordName = `Office expansion ${name.slice(-8)}`;
  await page.goto("/en/company/data-model");
  await page.getByRole("button", { name: "Create list", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Name", exact: false }).first().fill(name);
  await dialog.getByRole("button", { name: "Create list", exact: true }).click();
  await expect(page).toHaveURL(/\/en\/records\/[a-f0-9-]+$/);
  await expect(dialog).not.toBeVisible();
  const typeId = new URL(page.url()).pathname.split("/").at(-1);
  const type = await database.query('SELECT definition FROM "RecordTypeDefinition" WHERE "companyId"=$1 AND id=$2', [
    companyId,
    typeId,
  ]);
  expect(type.rows[0]?.definition.pluralLabel).toBe(name);
  await page.getByRole("link", { name: "Configure", exact: true }).click();
  await page.getByRole("button", { name: "Add field", exact: true }).click();
  await dialog.getByRole("textbox", { name: "Name", exact: false }).fill("Budget");
  await dialog.getByRole("combobox", { name: "Value type", exact: true }).click();
  await page.getByRole("option", { name: "Money", exact: true }).click();
  await dialog.getByRole("button", { name: "Preview changes", exact: true }).click();
  await expect(dialog.getByRole("status")).toContainText("Ready to apply");
  await dialog.getByRole("button", { name: "Apply changes", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole("main").getByRole("link", { name, exact: true }).click();
  await page.locator("#records-add").click();
  await dialog.getByRole("textbox", { name: name, exact: false }).fill(recordName);
  await dialog.getByRole("textbox", { name: "Budget", exact: false }).fill("123456789012345.125");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByText(recordName, { exact: true })).toBeVisible();
  const values = await database.query(
    'SELECT v."decimalValue"::text AS value FROM "RecordValue" v JOIN "RecordFieldDefinition" f ON f."companyId"=v."companyId" AND f.id=v."fieldId" WHERE v."companyId"=$1 AND v."typeId"=$2 AND f.definition->>\'label\'=\'Budget\'',
    [companyId, typeId],
  );
  expect(values.rows.map((row: { value: string }) => row.value.replace(/0+$/, ""))).toEqual(["123456789012345.125"]);
  await page.reload();
  await expect(page.getByText(recordName, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: recordName, exact: true }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("textbox", { name: "Budget", exact: false })).toHaveValue("123456789012345.125");
  const surface =
    (await dialog.getAttribute("data-overlay-surface")) === "dialog" ? dialog.locator('[data-uid="app-card"]') : dialog;
  await expect(surface).toHaveCSS("background-color", /^(?:rgb\(|oklch\()/);
  await expect(dialog).toHaveCSS("opacity", "1");
  expect(errors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("record-details.png"), fullPage: true, animations: "disabled" });
  await page.keyboard.press("Escape");
  await page.getByRole("link", { name: "Configure", exact: true }).click();
  await page.getByRole("button", { name: "Relationship", exact: true }).click();
  await dialog.getByRole("combobox", { name: "Link to", exact: true }).click();
  await page.getByRole("option", { name: "Organizations", exact: true }).click();
  await dialog.getByRole("textbox", { name: "Label on this side", exact: false }).fill("Client organization");
  await dialog.getByRole("textbox", { name: "Label on the other side", exact: false }).fill(name);
  await dialog.getByRole("button", { name: "Preview changes", exact: true }).click();
  await expect(dialog.getByRole("status")).toContainText("Ready to apply");
  await dialog.getByRole("button", { name: "Apply changes", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const organization = await database.query(
    'SELECT r.id,r."typeId",v."textValue" AS name FROM "CrmRecord" r JOIN "RecordTypeDefinition" t ON t."companyId"=r."companyId" AND t.id=r."typeId" JOIN "RecordValue" v ON v."companyId"=r."companyId" AND v."typeId"=r."typeId" AND v."recordId"=r.id AND v."fieldId"=(t.definition->>\'primaryFieldId\') WHERE r."companyId"=$1 AND t.definition->>\'pluralLabel\'=\'Organizations\' ORDER BY r.id LIMIT 1',
    [companyId],
  );
  const client = organization.rows[0];
  expect(client).toBeDefined();
  await page.getByRole("main").getByRole("link", { name, exact: true }).click();
  await page.getByRole("button", { name: recordName, exact: true }).click();
  await dialog.getByRole("combobox", { name: "Client organization", exact: true }).click();
  await page.getByRole("option", { name: client.name, exact: true }).click();
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const linked = await database.query(
    'SELECT id FROM "RecordLink" WHERE "companyId"=$1 AND "sourceTypeId"=$2 AND "targetId"=$3',
    [companyId, typeId, client.id],
  );
  expect(linked.rows).toHaveLength(1);
  await expect(page.getByRole("columnheader", { name: "Created at", exact: false })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Assigned to", exact: false })).toBeVisible();
  await page.getByRole("button", { name: `Open ${client.name}`, exact: true }).click();
  await expect(dialog.getByText(recordName, { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: `Unlink ${recordName}`, exact: true }).click();
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const unlinked = await database.query('SELECT id FROM "RecordLink" WHERE "companyId"=$1 AND id=$2', [
    companyId,
    linked.rows[0].id,
  ]);
  expect(unlinked.rows).toHaveLength(0);
  await page.goto(`/en/company/data-model?typeId=${typeId}`);
  await page.getByRole("button", { name: "Type settings", exact: true }).click();
  const renamed = name.replace("Projects", "Initiatives");
  await dialog.locator("#pluralName").fill(renamed);
  await dialog.getByRole("combobox", { name: "Default grouping", exact: true }).click();
  await page.getByRole("option", { name: "Assigned to", exact: true }).click();
  await dialog.getByRole("button", { name: "Add summary", exact: true }).click();
  await expect(dialog.getByRole("combobox", { name: "Summary field", exact: true })).toContainText("Budget");
  await dialog
    .getByRole("group", { name: "Default columns", exact: true })
    .getByRole("checkbox", { name: "Budget", exact: true })
    .uncheck();
  await dialog.getByRole("combobox", { name: "Default sort", exact: true }).click();
  await page.getByRole("option", { name: "Budget", exact: true }).click();
  await dialog.getByRole("button", { name: "Preview changes", exact: true }).click();
  await expect(dialog.getByRole("status")).toContainText("Ready to apply");
  await dialog.getByRole("button", { name: "Apply changes", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole("main").getByRole("link", { name: renamed, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/en/records/${typeId}`));
  await expect(
    page.locator('[data-slot="group-header-row"] [aria-label="Budget · Sum: €123,456,789,012,345.13"]'),
  ).toBeVisible();
  await expect(
    page.getByRole("columnheader").filter({ has: page.getByRole("button", { name: "Budget", exact: true }) }),
  ).not.toBeVisible();
  await page.getByRole("button", { name: "Appearance", exact: true }).click();
  await page.getByRole("checkbox", { name: "Budget", exact: true }).check();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("columnheader").filter({ has: page.getByRole("button", { name: "Budget", exact: true }) }),
  ).toBeVisible();
  await expect
    .poll(async () => {
      const saved = await database.query('SELECT "hiddenColumns" FROM "P13n" WHERE "companyId"=$1 AND "p13nId"=$2', [
        companyId,
        `records:${typeId}`,
      ]);
      return saved.rows[0]?.hiddenColumns;
    })
    .toEqual([]);
  await page.reload();
  await expect(
    page.getByRole("columnheader").filter({ has: page.getByRole("button", { name: "Budget", exact: true }) }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Appearance", exact: true }).click();
  await page.getByRole("button", { name: "Reset to shared defaults", exact: true }).click();
  await expect(
    page.getByRole("columnheader").filter({ has: page.getByRole("button", { name: "Budget", exact: true }) }),
  ).not.toBeVisible();
  const configured = await database.query(
    'SELECT definition FROM "RecordTypeDefinition" WHERE "companyId"=$1 AND id=$2',
    [companyId, typeId],
  );
  expect(configured.rows[0].definition.pluralLabel).toBe(renamed);
  expect(configured.rows[0].definition.defaults.hiddenColumns).toHaveLength(1);
  expect(configured.rows[0].definition.defaults.groupSummaries).toEqual([
    { fieldId: configured.rows[0].definition.defaults.hiddenColumns[0], aggregation: "sum" },
  ]);

  await page.goto("/en/dashboard");
  await page.locator("#dashboard-add-widget").click();
  await dialog.locator("#widget-kind-chart").click();
  const widgetName = `Budget ${name.slice(-8)}`;
  await dialog.getByRole("textbox", { name: "Name", exact: false }).fill(widgetName);
  await dialog.getByRole("combobox", { name: "Records from", exact: true }).click();
  await page.locator('[data-slot="popover-content"]').getByRole("combobox").fill(renamed);
  await page.getByRole("option", { name: renamed, exact: true }).click();
  await dialog.getByRole("combobox", { name: "Measure", exact: true }).click();
  await page.getByRole("option", { name: "Sum", exact: true }).click();
  await dialog.getByRole("combobox", { name: "Value field", exact: false }).click();
  await page.getByRole("option", { name: "Budget", exact: true }).click();
  await dialog.locator("#widget-tab-filters").click();
  await dialog.getByRole("combobox", { name: "Add filter", exact: true }).click();
  await page.getByRole("option", { name: "Budget", exact: true }).click();
  await dialog.getByRole("combobox", { name: "Condition", exact: true }).click();
  await page.getByRole("option", { name: "Greater than", exact: true }).click();
  await dialog.getByLabel("Value", { exact: true }).fill("100");
  await dialog.getByRole("combobox", { name: "Add a linked-record filter", exact: true }).click();
  await page.getByRole("option", { name: "Client organization", exact: true }).click();
  await dialog.getByRole("combobox", { name: "Linked records", exact: true }).click();
  await page.getByRole("option", { name: "No accessible linked records match", exact: true }).click();
  await dialog.getByRole("button", { name: "Preview measure", exact: true }).click();
  await expect(dialog.getByText(/Overall:.*123,456,789,012,345\.125/)).toBeVisible();
  await dialog.locator("#widget-modal-save").click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("heading", { name: widgetName, exact: true })).toBeVisible();
  const savedWidget = await database.query('SELECT measure FROM "Widget" WHERE "companyId"=$1 AND name=$2', [
    companyId,
    widgetName,
  ]);
  expect(savedWidget.rows).toHaveLength(1);
  expect(savedWidget.rows[0].measure.source.typeId).toBe(typeId);
  expect(savedWidget.rows[0].measure.aggregation).toBe("sum");
  expect(savedWidget.rows[0].measure.source.filters).toMatchObject([
    { operator: "gt", value: { kind: "decimal", value: "100", currency: "EUR" } },
  ]);
  expect(savedWidget.rows[0].measure.source.relatedFilters).toMatchObject([
    { operator: "none", path: [{ direction: "outgoing" }] },
  ]);
  await page.reload();
  const widgetCard = page
    .locator('[data-uid="app-card"]')
    .filter({ has: page.getByRole("heading", { name: widgetName, exact: true }) });
  await expect(widgetCard.getByText(/Overall:.*123,456,789,012,345\.125/)).toBeVisible();
  const bar = widgetCard.locator(".recharts-bar-rectangle path").first();
  await expect(bar).toBeVisible();
  if (!testInfo.project.use.isMobile) {
    await bar.hover();
    await expect(
      widgetCard.locator(".recharts-tooltip-wrapper").getByText("€123,456,789,012,345.125", { exact: true }),
    ).toBeVisible();
  }
  await widgetCard.screenshot({ path: testInfo.outputPath("custom-budget-widget.png") });

  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  );
  const settledNoticeCount = resizeNotices.length;
  await page.evaluate(async () => {
    for (let frame = 0; frame < 8; frame++)
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  });
  expect(resizeNotices).toHaveLength(settledNoticeCount);
  if (resizeNotices.length)
    await testInfo.attach("settled-resize-observer-notices", {
      body: JSON.stringify({ source: "Radix/Floating UI select positioning", locations: resizeNotices }),
      contentType: "application/json",
    });
  expect(errors).toEqual([]);
});
