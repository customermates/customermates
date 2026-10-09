import { addFromConfigure, followConfigureLink, saveDrawer } from "./configure";
import { test, expect, isAppConsoleError, isBenignPageError } from "./fixtures";
import { presetId } from "../../features/records/crm-preset";
import { openRecordDetails } from "./record-rows";

test("edits duplicate embedded items, live and saved prices, and weighted totals through the generic UI", async ({
  page,
  database,
  companyId,
}, testInfo) => {
  test.setTimeout(240000);
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    if (!isBenignPageError(error.message)) errors.push(error.message);
  });
  page.on("console", (message) => {
    if (isAppConsoleError(message)) errors.push(message.text());
  });
  const dialogs = page.getByRole("dialog");
  const typeId = (key: string) => presetId(companyId, key);
  const openRecords = async (key: string) => {
    const link = page.locator(`[id="nav-records:${typeId(key)}"]`);
    if (!(await link.isVisible())) await page.locator("#sidebar-trigger").click();
    await link.click();
    await expect.poll(() => new URL(page.url()).pathname).toBe(`/en/records/${typeId(key)}`);
    await expect(page.locator("#records-add")).toBeEnabled();
  };
  await page.goto(`/en/records/${typeId("service")}`);
  for (const [name, price] of [
    ["Service A", "1000"],
    ["Service B", "200"],
  ]) {
    await page.locator("#records-add").click();
    await dialogs.getByRole("textbox", { name: "Name", exact: false }).fill(name);
    await dialogs.getByRole("textbox", { name: "Price", exact: false }).fill(price);
    await dialogs.getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialogs).not.toBeVisible();
    await expect(page.getByText(name, { exact: true })).toBeVisible();
  }
  await openRecords("deal");
  await page.locator("#records-add").click();
  await dialogs.getByRole("textbox", { name: "Name", exact: false }).fill("Local opportunity");
  await dialogs.getByRole("combobox", { name: "Stage", exact: true }).click();
  await page.getByRole("option", { name: "Proposal", exact: true }).click();
  await dialogs.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialogs).not.toBeVisible();
  await openRecordDetails(page, "Local opportunity");
  await expect(dialogs.getByRole("region", { name: "Line items" })).toBeVisible();
  for (const [name, service, quantity] of [
    ["A first", "Service A", "1"],
    ["A second", "Service A", "1"],
    ["B", "Service B", "3"],
  ]) {
    await dialogs.getByRole("button", { name: "Add Line item", exact: true }).click();
    await expect(page.getByRole("dialog", { includeHidden: true })).toHaveCount(2);
    const child = dialogs.last();
    await child.getByRole("textbox", { name: "Name", exact: false }).fill(name);
    await child.getByRole("textbox", { name: "Quantity", exact: false }).fill(quantity);
    await child.getByRole("combobox", { name: "Service", exact: true }).click();
    await page.getByRole("option", { name: service, exact: true }).click();
    await child.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("dialog", { includeHidden: true })).toHaveCount(1);
    await expect(
      dialogs.getByRole("region", { name: "Line items" }).getByRole("button", { name, exact: true }),
    ).toBeVisible();
  }
  const totals = async () => {
    const rows = await database.query(
      'SELECT f.definition->>\'label\' AS label,trim_scale(v."decimalValue")::text AS value FROM "RecordValue" v JOIN "RecordFieldDefinition" f ON f."companyId"=v."companyId" AND f.id=v."fieldId" WHERE v."companyId"=$1 AND v."typeId"=$2 AND f.id=ANY($3::text[])',
      [
        companyId,
        typeId("deal"),
        [typeId("deal.totalValue"), typeId("deal.totalQuantity"), typeId("deal.weightedValue")],
      ],
    );
    return Object.fromEntries(rows.rows.map((row) => [row.label, row.value]));
  };
  await expect.poll(totals).toEqual({ Value: "2600", Quantity: "5", "Weighted value": "1560" });
  await expect(dialogs.getByText("€2,600.00", { exact: true })).toBeVisible();
  await expect(dialogs.getByText("€1,560.00", { exact: true })).toBeVisible();
  await expect(
    dialogs
      .getByRole("region", { name: "Services", exact: true })
      .getByRole("button", { name: "Open Service A", exact: true }),
  ).toHaveCount(1);
  await expect(
    dialogs
      .getByRole("region", { name: "Services", exact: true })
      .getByRole("button", { name: "Open Service B", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialogs).not.toBeVisible();
  await followConfigureLink(page);
  await addFromConfigure(page, "Relationship");
  await dialogs.getByRole("combobox", { name: "Connection", exact: true }).click();
  await page.getByRole("option", { name: "Through linked records", exact: true }).click();
  await dialogs.getByRole("textbox", { name: "Name", exact: false }).fill("Offered services");
  await dialogs.getByRole("combobox", { name: "Add a relationship step", exact: true }).click();
  await page.getByRole("option", { name: "Line items", exact: true }).click();
  await dialogs.getByRole("combobox", { name: "Add a relationship step", exact: true }).click();
  await page.getByRole("option", { name: "Service", exact: true }).click();
  await saveDrawer(page);
  const configured = await database.query(
    'SELECT definition FROM "RecordTypeDefinition" WHERE "companyId"=$1 AND id=$2',
    [companyId, typeId("deal")],
  );
  const path = configured.rows[0].definition.relationshipPaths.find(
    (path: { label: string }) => path.label === "Offered services",
  );
  expect(path).toMatchObject({
    path: [
      { relationId: typeId("lineItem.deal"), direction: "incoming" },
      { relationId: typeId("lineItem.service"), direction: "outgoing" },
    ],
  });
  await openRecords("deal");
  await expect(page.getByRole("columnheader", { name: "Offered services", exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Appearance", exact: true }).click();
  await page.getByRole("combobox", { name: "Group By", exact: true }).click();
  await page.getByRole("option", { name: "Offered services", exact: true }).click();
  if (testInfo.project.name === "mobile") await page.locator('[data-slot="drawer-close"]').click();
  else await page.keyboard.press("Escape");
  await expect(page.getByRole("link", { name: "Local opportunity", exact: true })).toHaveCount(2);
  await expect
    .poll(async () => {
      const preferences = await database.query('SELECT grouping FROM "P13n" WHERE "companyId"=$1 AND "p13nId"=$2', [
        companyId,
        `records:${typeId("deal")}`,
      ]);
      return preferences.rows[0]?.grouping;
    })
    .toEqual({ field: `path:${path.id}` });
  await page.screenshot({
    path: testInfo.outputPath("relationship-path-groups.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Appearance", exact: true }).click();
  await page.getByRole("button", { name: "Reset to shared defaults", exact: true }).click();
  await expect(page.getByRole("link", { name: "Local opportunity", exact: true })).toHaveCount(1);
  const changeLivePrice = async (price: string) => {
    await openRecords("service");
    await openRecordDetails(page, "Service A");
    await dialogs.getByRole("textbox", { name: "Price", exact: false }).fill(price);
    await dialogs.getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialogs).not.toBeVisible();
  };
  await changeLivePrice("1200");
  await expect.poll(totals).toEqual({ Value: "3000", Quantity: "5", "Weighted value": "1800" });
  await openRecords("deal");
  await openRecordDetails(page, "Local opportunity");
  for (const name of ["A first", "A second"]) {
    await dialogs.getByRole("region", { name: "Line items" }).getByRole("button", { name, exact: true }).click();
    await expect(page.getByRole("dialog", { includeHidden: true })).toHaveCount(2);
    const child = dialogs.last();
    await child.getByRole("combobox", { name: "Pricing", exact: false }).click();
    await page.getByRole("option", { name: "Saved price", exact: true }).click();
    await child.getByRole("textbox", { name: "Saved unit price", exact: false }).fill("1000");
    await child.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("dialog", { includeHidden: true })).toHaveCount(1);
  }
  await expect.poll(totals).toEqual({ Value: "2600", Quantity: "5", "Weighted value": "1560" });
  await dialogs.getByRole("region", { name: "Line items" }).getByRole("button", { name: "B", exact: true }).click();
  await expect(page.getByRole("dialog", { includeHidden: true })).toHaveCount(2);
  await dialogs.getByRole("combobox", { name: "Pricing", exact: false }).click();
  await page.getByRole("option", { name: "Saved price", exact: true }).click();
  await dialogs.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("dialog", { includeHidden: true })).toHaveCount(1);
  const captured = await database.query(
    'SELECT trim_scale(v."decimalValue")::text AS value FROM "RecordValue" v JOIN "RecordValue" name ON name."companyId"=v."companyId" AND name."typeId"=v."typeId" AND name."recordId"=v."recordId" AND name."fieldId"=$3 WHERE v."companyId"=$1 AND v."fieldId"=$2 AND name."textValue"=\'B\'',
    [companyId, typeId("lineItem.savedPrice"), typeId("lineItem.name")],
  );
  expect(captured.rows).toEqual([{ value: "200" }]);
  await expect(dialogs).toHaveCSS("opacity", "1");
  await page.screenshot({
    path: testInfo.outputPath("duplicate-saved-line-items.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.keyboard.press("Escape");
  await expect(dialogs).not.toBeVisible();
  await changeLivePrice("1400");
  await expect.poll(totals).toEqual({ Value: "2600", Quantity: "5", "Weighted value": "1560" });
  await openRecords("deal");
  await openRecordDetails(page, "Local opportunity");
  await dialogs.getByRole("combobox", { name: "Stage", exact: true }).click();
  await page.getByRole("option", { name: "Lost", exact: true }).click();
  await dialogs.getByRole("button", { name: "Save", exact: true }).click();
  await expect.poll(totals).toEqual({ Value: "2600", Quantity: "5", "Weighted value": "0" });
  const lines = await database.query(
    'SELECT COUNT(*)::integer AS count FROM "CrmRecord" WHERE "companyId"=$1 AND "typeId"=$2 AND "deletedAt" IS NULL',
    [companyId, typeId("lineItem")],
  );
  expect(lines.rows).toEqual([{ count: 3 }]);
  await expect(dialogs).not.toBeVisible();
  await openRecords("service");
  await openRecordDetails(page, "Service A");
  await dialogs.getByRole("button", { name: "Delete", exact: true }).click();
  const confirmation = page.getByRole("alertdialog");
  await expect(confirmation).toContainText("Services: 1; Line items: 2");
  await expect(confirmation).toContainText("Links removed: 4");
  await page.screenshot({
    path: testInfo.outputPath("service-deletion-preview.png"),
    fullPage: true,
    animations: "disabled",
  });
  await confirmation.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect.poll(totals).toEqual({ Value: "2600", Quantity: "5", "Weighted value": "0" });
  await dialogs.getByRole("button", { name: "Delete", exact: true }).click();
  await confirmation.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(dialogs).not.toBeVisible();
  await expect.poll(totals).toEqual({ Value: "600", Quantity: "3", "Weighted value": "0" });
  const remaining = await database.query(
    'SELECT COUNT(*)::integer AS count FROM "CrmRecord" WHERE "companyId"=$1 AND "typeId"=$2 AND "deletedAt" IS NULL',
    [companyId, typeId("lineItem")],
  );
  expect(remaining.rows).toEqual([{ count: 1 }]);
  expect(errors).toEqual([]);
});
