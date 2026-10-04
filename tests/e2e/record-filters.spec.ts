import { test, expect, isAppConsoleError, isBenignPageError } from "./fixtures";
import { presetId } from "../../features/records/crm-preset";

test("restores relationship, assignment and date filters with labels after reloading the generic list", async ({
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
  const typeId = presetId(companyId, "deal");
  const relationship = `relationship:${presetId(companyId, "deal.organizations")}:outgoing`;
  await page.goto(`/en/records/${typeId}`);
  for (const [name, linked] of [
    ["Linked opportunity", true],
    ["Unlinked opportunity", false],
  ] as const) {
    await page.locator("#records-add").click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("textbox", { name: "Name", exact: false }).fill(name);
    if (linked) {
      await dialog.getByRole("combobox", { name: "Organizations", exact: true }).click();
      await page.getByRole("option", { name: "Example organization", exact: true }).click();
    }
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialog).not.toBeVisible();
  }
  const organization = await database.query('SELECT id FROM "CrmRecord" WHERE "companyId"=$1 AND "typeId"=$2', [
    companyId,
    presetId(companyId, "organization"),
  ]);
  const members = await database.query('SELECT id FROM "User" WHERE "companyId"=$1', [companyId]);
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  await page.locator(`[data-palette-field="${relationship}"]`).click();
  await expect(page.getByText("Organizations", { exact: true }).last()).toBeVisible();
  await page.locator(`[data-palette-value="${organization.rows[0].id}"]`).click();
  await page.locator("#filter-palette-back").click();
  await page.locator('[data-palette-field="system:assignedTo"]').click();
  await page.locator(`[data-palette-value="${members.rows[0].id}"]`).click();
  await page.locator("#filter-palette-back").click();
  await page.locator('[data-palette-field="system:updatedAt"]').click();
  await page.locator('[data-palette-value="inLastDays-7"]').click();
  await page.locator("#filter-palette-back").click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: "Filters", exact: true })).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Linked opportunity", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Unlinked opportunity", exact: true })).not.toBeVisible();
  await expect
    .poll(async () => {
      const stored = await database.query('SELECT filters FROM "P13n" WHERE "companyId"=$1 AND "p13nId"=$2', [
        companyId,
        `records:${typeId}`,
      ]);
      return stored.rows[0]?.filters;
    })
    .toEqual([
      { field: relationship, operator: "in", value: [organization.rows[0].id] },
      { field: "system:assignedTo", operator: "in", value: [members.rows[0].id] },
      { field: "system:updatedAt", operator: "inLastDays", value: 7 },
    ]);
  await page.reload();
  await expect(page.getByRole("button", { name: "Linked opportunity", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Unlinked opportunity", exact: true })).not.toBeVisible();
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  const active = page.locator("[data-palette-active-filters]");
  await expect(active).toContainText("Example organization");
  await expect(active).toContainText("Browser Administrator");
  await expect(active).toContainText("7");
  await page.screenshot({ path: testInfo.outputPath("record-filters.png"), fullPage: true, animations: "disabled" });
  expect(errors).toEqual([]);
});
