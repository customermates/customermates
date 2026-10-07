import type { Client } from "pg";
import { presetId } from "../../features/records/crm-preset";
import { RecordModelSchema } from "../../features/records/record-model.schema";
import { openConfigure, openConfigureRow, saveDrawer } from "./configure";
import { expect, test, isAppConsoleError, isBenignPageError } from "./fixtures";

async function fieldCurrency(database: Client, companyId: string, fieldId: string) {
  const result = await database.query(
    'SELECT revision.snapshot FROM "RecordSchemaRevision" revision JOIN "RecordSchemaState" state ON state."companyId" = revision."companyId" AND state.revision = revision.revision WHERE revision."companyId" = $1',
    [companyId],
  );
  return RecordModelSchema.parse(result.rows[0]?.snapshot).fields.find((field) => field.id === fieldId)?.format
    ?.currency;
}

async function storedCurrencies(database: Client, companyId: string, fieldId: string) {
  const result = await database.query(
    'SELECT currency FROM "RecordValue" WHERE "companyId" = $1 AND "fieldId" = $2 AND state = \'value\' ORDER BY currency',
    [companyId, fieldId],
  );
  return result.rows.map((row: { currency: string | null }) => row.currency);
}

test("gives each money field its own currency, with no company settings page", async ({
  page,
  database,
  companyId,
}) => {
  test.setTimeout(240000);
  const id = (key: string) => presetId(companyId, key);
  const dialog = page.getByRole("dialog");

  await test.step("the company settings page is gone", async () => {
    const response = await page.goto("/en/company/settings");
    expect(response?.status()).toBe(404);
  });

  await page.goto(`/en/records/${id("deal")}`);
  await expect(page.locator("#records-add")).toBeEnabled();
  await expect(page.locator('[id="nav-company-settings"]')).toHaveCount(0);
  await page.waitForLoadState("networkidle");
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    if (!isBenignPageError(error.message)) errors.push(error.message);
  });
  page.on("console", (message) => {
    if (isAppConsoleError(message)) errors.push(message.text());
  });

  await test.step("an empty deal value starts in the field currency", async () => {
    await page.locator("#records-add").click();
    await dialog.getByRole("textbox", { name: "Name", exact: false }).fill("Currency check");
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    expect(await fieldCurrency(database, companyId, id("deal.totalValue"))).toBe("EUR");
    await expect.poll(() => storedCurrencies(database, companyId, id("deal.totalValue"))).toEqual(["EUR"]);
  });

  await test.step("switching the field currency in Configure recalculates the empty total", async () => {
    await openConfigure(page, id("deal"));
    await openConfigureRow(page, "Fields", "Value");
    const currency = dialog.getByRole("combobox", { name: "Currency", exact: false });
    await expect(currency).toBeVisible();
    await currency.click();
    await page.getByPlaceholder("Search...").fill("CHF");
    await page.getByRole("option", { name: /\(CHF\)$/ }).click();
    await expect(currency).toContainText("CHF");
    await saveDrawer(page);
    await expect.poll(() => fieldCurrency(database, companyId, id("deal.totalValue"))).toBe("CHF");
    await expect.poll(() => storedCurrencies(database, companyId, id("deal.totalValue"))).toEqual(["CHF"]);
  });

  expect(errors).toEqual([]);
});
