import ExcelJS from "exceljs";

import { test, expect } from "./fixtures";
import { presetId } from "../../features/records/crm-preset";

test.use({ failOnPageErrors: true });

async function workbook(rows: unknown[][]): Promise<Buffer> {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("Deals");
  for (const row of rows) sheet.addRow(row);
  return Buffer.from(await book.xlsx.writeBuffer());
}

test("imports an Excel workbook through the column-mapping wizard and reports the rows it could not import", async ({
  page,
  database,
  companyId,
}) => {
  test.setTimeout(180000);
  const organizationTypeId = presetId(companyId, "organization");
  const dealTypeId = presetId(companyId, "deal");

  await page.goto(`/en/records/${organizationTypeId}`);
  await page.locator("#records-add").click();
  const editor = page.getByRole("dialog");
  await editor
    .getByRole("textbox", { name: "Name", exact: false })
    .fill("Xlsx Partner GmbH");
  await editor.getByRole("button", { name: "Save", exact: true }).click();
  await expect(editor).not.toBeVisible();

  const countDeals = async () =>
    (
      await database.query(
        `SELECT COUNT(*)::integer AS count FROM "CrmRecord" WHERE "companyId"=$1 AND "typeId"=$2`,
        [companyId, dealTypeId],
      )
    ).rows[0]?.count as number;
  const before = await countDeals();

  await page.goto(`/en/records/${dealTypeId}`);
  await page.locator("#records-more").click();
  await page
    .getByRole("menuitem", { name: "Add from file", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.locator('input[type="file"]').setInputFiles({
    name: "deals.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: await workbook([
      ["Name", "Stage", "Firm", "Notes"],
      [
        "Atlas spreadsheet deal",
        "qualified",
        "xlsx partner gmbh",
        "Imported from Excel",
      ],
      ["Borealis spreadsheet deal", "Won", "", ""],
      ["Cyclone spreadsheet deal", "Maybe", "", ""],
    ]),
  });
  await expect(dialog).toContainText("Step 1 of 5");
  await expect(dialog).toContainText("Deals: 3 rows and 4 columns.");
  await dialog.getByRole("button", { name: "Next", exact: true }).click();

  await expect(dialog).toContainText("Step 2 of 5");
  await expect(dialog.locator("#xlsx-import-target-0")).toContainText("Name");
  await expect(dialog.locator("#xlsx-import-target-1")).toContainText("Stage");
  await expect(dialog.locator("#xlsx-import-target-2")).toContainText(
    "Skip column",
  );
  await dialog.locator("#xlsx-import-target-2").click();
  await page
    .getByRole("option", { name: "Organizations", exact: true })
    .click();
  await expect(dialog.locator("#xlsx-import-target-2")).toContainText(
    "Organizations",
  );
  await dialog.getByRole("button", { name: "Next", exact: true }).click();

  await expect(dialog).toContainText("Step 3 of 5");
  await expect(dialog).toContainText("1 of the first 3 rows has a problem.");
  await expect(dialog).toContainText("“Maybe” is not an option of this field.");
  await dialog.getByRole("button", { name: "Next", exact: true }).click();

  await expect(dialog).toContainText("Step 4 of 5");
  await expect(
    dialog.getByRole("tab", { name: "New records", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await dialog
    .getByRole("button", { name: "Import records", exact: true })
    .click();

  const summary = dialog.getByTestId("xlsx-import-summary");
  await expect(summary).toContainText("2 records created", { timeout: 60000 });
  await expect(summary).toContainText("1 row failed");
  await expect(dialog).toContainText("“Maybe” is not an option of this field.");

  expect(await countDeals()).toBe(before + 2);
  const linked = await database.query(
    `SELECT COUNT(*)::integer AS count FROM "RecordLink" WHERE "companyId"=$1 AND "relationId"=$2`,
    [companyId, presetId(companyId, "deal.organizations")],
  );
  expect(linked.rows[0]?.count).toBe(1);

  await dialog.locator("#xlsx-import-save").click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByText("Atlas spreadsheet deal").first()).toBeVisible();
  await expect(
    page.getByText("Borealis spreadsheet deal").first(),
  ).toBeVisible();
  await expect(page.getByText("Cyclone spreadsheet deal")).toHaveCount(0);
  await page.close();
});
