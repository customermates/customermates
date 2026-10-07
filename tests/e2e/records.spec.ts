import englishMessages from "../../i18n/locales/en.json" with { type: "json" };
import { presetId } from "../../features/records/crm-preset";
import { randomUUID } from "node:crypto";
import {
  addFromConfigure,
  followConfigureLink,
  openConfigure,
  openListAction,
  saveDrawer,
  saveGeneral,
} from "./configure";
import { test, expect, isAppConsoleError, isBenignPageError } from "./fixtures";

test("creates a custom list and field through the UI, then persists a decimal record across reloads", async ({
  page,
  database,
  companyId,
}, testInfo) => {
  test.setTimeout(240000);
  const errors: string[] = [];
  const resizeNotices: string[] = [];
  page.on("pageerror", (error) => {
    if (error.message === "ResizeObserver loop completed with undelivered notifications.")
      resizeNotices.push(page.url());
    else if (!isBenignPageError(error.message)) errors.push(error.message);
  });
  page.on("console", (message) => {
    if (isAppConsoleError(message)) errors.push(message.text());
  });
  const name = `Projects ${randomUUID().slice(0, 8)}`;
  const recordName = `Office expansion ${name.slice(-8)}`;
  await openConfigure(page);
  await addFromConfigure(page, "List");
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Name", exact: false }).first().fill(name);
  await dialog.getByRole("button", { name: "Create list", exact: true }).first().click();
  await expect(page).toHaveURL(/\/en\/records\/[a-f0-9-]+$/);
  await expect(dialog).not.toBeVisible();
  const typeId = new URL(page.url()).pathname.split("/").at(-1);
  const openConfiguredRecords = async () => {
    const link = page.locator(`[id="nav-records:${typeId}"]`);
    if (!(await link.isVisible())) await page.locator("#sidebar-trigger").click();
    await link.click();
    await expect(page).toHaveURL(new RegExp(`/en/records/${typeId}$`));
  };
  const type = await database.query('SELECT definition FROM "RecordTypeDefinition" WHERE "companyId"=$1 AND id=$2', [
    companyId,
    typeId,
  ]);
  expect(type.rows[0]?.definition.pluralLabel).toBe(name);
  await followConfigureLink(page);
  await addFromConfigure(page, "Field");
  await dialog.getByRole("textbox", { name: "Name", exact: false }).fill("Budget");
  await dialog.getByRole("combobox", { name: "Value type", exact: true }).click();
  await page.getByRole("option", { name: "Money", exact: true }).click();
  await saveDrawer(page);
  await openConfiguredRecords();
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
  await followConfigureLink(page);
  await addFromConfigure(page, "Relationship");
  await dialog.getByRole("combobox", { name: "Link to", exact: true }).click();
  await page.getByRole("option", { name: "Organizations", exact: true }).click();
  await dialog.getByRole("textbox", { name: "Label on this side", exact: false }).fill("Client organization");
  await dialog.getByRole("textbox", { name: "Label on the other side", exact: false }).fill(name);
  await saveDrawer(page);
  const organization = await database.query(
    'SELECT r.id,r."typeId",v."textValue" AS name FROM "CrmRecord" r JOIN "RecordTypeDefinition" t ON t."companyId"=r."companyId" AND t.id=r."typeId" JOIN "RecordValue" v ON v."companyId"=r."companyId" AND v."typeId"=r."typeId" AND v."recordId"=r.id AND v."fieldId"=(t.definition->>\'primaryFieldId\') WHERE r."companyId"=$1 AND t.definition->>\'pluralLabel\'=\'Organizations\' ORDER BY r.id LIMIT 1',
    [companyId],
  );
  const client = organization.rows[0];
  expect(client).toBeDefined();
  await openConfiguredRecords();
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
  await expect(dialog).toHaveCount(0);
  await expect(page.locator("#sidebar-trigger")).toHaveAttribute("aria-disabled", "false");
  await followConfigureLink(page);
  await expect(page).toHaveURL(`/en/configure?typeId=${typeId}`);
  const renamed = name.replace("Projects", "Initiatives");
  await page
    .getByRole("region", { name: "General", exact: true })
    .getByRole("textbox", { name: "Navigation label", exact: true })
    .fill(renamed);
  await saveGeneral(page);
  await openListAction(page, "Shared defaults");
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
  await saveDrawer(page);
  await openConfiguredRecords();
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

  const dashboard = page.locator("#nav-dashboard");
  if (!(await dashboard.isVisible())) await page.locator("#sidebar-trigger").click();
  await dashboard.click();
  await expect(page).toHaveURL("/en/dashboard");
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
  await dialog.getByRole("tab", { name: "Filters, none active", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "Filters, none active", exact: true })).toBeAttached();
  await dialog.getByRole("combobox", { name: "Add filter", exact: true }).click();
  await page.getByRole("option", { name: "Budget", exact: true }).click();
  await dialog.getByRole("combobox", { name: "Condition", exact: true }).click();
  await page.getByRole("option", { name: "Greater than", exact: true }).click();
  await dialog.getByLabel("Value", { exact: true }).fill("100");
  await dialog.getByRole("combobox", { name: "Add a linked-record filter", exact: true }).click();
  await page.getByRole("option", { name: "Client organization", exact: true }).click();
  await dialog.getByRole("combobox", { name: "Linked records", exact: true }).click();
  await page.getByRole("option", { name: "No accessible linked records match", exact: true }).click();
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
  if (resizeNotices.length) {
    await testInfo.attach("settled-resize-observer-notices", {
      body: JSON.stringify({ source: "Radix/Floating UI select positioning", locations: resizeNotices }),
      contentType: "application/json",
    });
  }
  expect(errors).toEqual([]);
});

test("resizes table columns with keyboard controls, restores saved widths and resets the override", async ({
  page,
  database,
  companyId,
  workspace,
  isMobile,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    if (!isBenignPageError(error.message)) errors.push(error.message);
  });
  page.on("console", (message) => {
    if (isAppConsoleError(message)) errors.push(message.text());
  });
  const typeId = presetId(companyId, "organization");
  const fieldId = presetId(companyId, "organization.name");
  await page.goto(`/en/records/${typeId}`);
  await expect(page.getByRole("button", { name: "Example organization", exact: true })).toBeVisible();
  const handle = page.getByRole("button", {
    name: englishMessages.DataView.resizeColumn.replace("{column}", "Name"),
    exact: true,
  });
  const header = page.getByRole("columnheader").filter({ has: handle });
  const inlineWidth = () => header.evaluate((node) => (node as HTMLElement).style.width);
  const stored = async () =>
    (
      await database.query('SELECT "columnWidths" FROM "P13n" WHERE "companyId"=$1 AND "userId"=$2 AND "p13nId"=$3', [
        companyId,
        workspace.userId,
        `records:${typeId}`,
      ])
    ).rows[0]?.columnWidths?.[fieldId];
  await handle.focus();
  await expect(handle).toBeFocused();
  await handle.press("Home");
  await expect.poll(inlineWidth).toBe("80px");
  await expect.poll(stored).toBe(80);
  for (const [key, delta] of [
    ["ArrowRight", 10],
    ["Shift+ArrowRight", 30],
    ["ArrowLeft", -10],
  ] as const) {
    const bounds = await header.boundingBox();
    if (!bounds) throw new Error("The resizable table header is missing");
    const expected = Math.round(Math.max(80, bounds.width + delta) * 100) / 100;
    await handle.press(key);
    await expect.poll(stored).toBe(expected);
    await expect.poll(inlineWidth).toBe(`${expected}px`);
  }
  const saved = await stored();
  await page.reload();
  await expect(handle).toBeVisible();
  await expect.poll(inlineWidth).toBe(`${saved}px`);
  expect(await stored()).toBe(saved);
  if (!isMobile) {
    await handle.focus();
    const handleBounds = await handle.boundingBox();
    const headerBounds = await header.boundingBox();
    if (!handleBounds || !headerBounds) throw new Error("The desktop column resize handle is missing");
    const x = handleBounds.x + handleBounds.width / 2;
    const y = handleBounds.y + handleBounds.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x - 40, y, { steps: 5 });
    await expect(handle).toHaveAttribute("data-state", "resizing");
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await expect(handle).not.toHaveAttribute("data-state", "resizing");
    expect(await stored()).toBe(saved);
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x - 40, y, { steps: 5 });
    await page.mouse.up();
    const draggedWidth = Math.round(Math.max(80, headerBounds.width - 40) * 100) / 100;
    await expect.poll(stored).toBe(draggedWidth);
    await page.reload();
    await expect(handle).toBeVisible();
    await expect.poll(inlineWidth).toBe(`${draggedWidth}px`);
    expect(await stored()).toBe(draggedWidth);
  }
  await handle.focus();
  await handle.press("Enter");
  await expect.poll(stored).toBeUndefined();
  await expect.poll(inlineWidth).toBe("");
  await page.reload();
  await expect(handle).toBeVisible();
  await expect.poll(inlineWidth).toBe("");
  expect(await stored()).toBeUndefined();
  await page.screenshot({ path: testInfo.outputPath("table-column-width-reset.png"), animations: "disabled" });
  expect(errors).toEqual([]);
});
