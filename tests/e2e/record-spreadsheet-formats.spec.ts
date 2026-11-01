import { readFileSync } from "node:fs";

import { companyPath } from "./app-paths";
import { test, expect, collectPageErrors } from "./fixtures";
import { presetId } from "../../features/records/crm-preset";

const FIXTURES = "tests/fixtures/spreadsheet-import";

// Each file holds the same two German contacts, saved the way Excel for Mac, Excel for Windows and LibreOffice
// write them. mimeType is what browsers send for the file: Safari and Chrome on macOS send text/csv for CSV,
// browsers on Windows with Excel installed send application/vnd.ms-excel, and some send nothing.
const IMPORTABLE = [
  { file: "comma-utf8.csv", mimeType: "text/csv", sheet: "comma-utf8" },
  { file: "comma-utf8-bom.csv", mimeType: "application/vnd.ms-excel", sheet: "comma-utf8-bom" },
  { file: "comma-utf8-lf.csv", mimeType: "", sheet: "comma-utf8-lf" },
  { file: "semicolon-utf8.csv", mimeType: "text/csv", sheet: "semicolon-utf8" },
  { file: "semicolon-utf8-bom.csv", mimeType: "text/csv", sheet: "semicolon-utf8-bom" },
  { file: "semicolon-macroman.csv", mimeType: "text/csv", sheet: "semicolon-macroman" },
  { file: "semicolon-cp1252.csv", mimeType: "application/vnd.ms-excel", sheet: "semicolon-cp1252" },
  {
    file: "libreoffice.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    sheet: "contacts",
  },
];

async function openImport(page: import("@playwright/test").Page, companyId: string) {
  await page.goto(companyPath(companyId, `/records/${presetId(companyId, "contact")}`));
  await page.locator("#records-more").click();
  await page.getByRole("menuitem", { name: "Add from file", exact: true }).click();
  return page.getByRole("dialog");
}

test("offers CSV and Excel files in the file picker of a list import", async ({ page, companyId }) => {
  const dialog = await openImport(page, companyId);
  const accept = (await dialog.locator('input[type="file"]').getAttribute("accept"))?.split(",") ?? [];
  expect(accept).toEqual(expect.arrayContaining([".csv", ".xlsx", ".xls", ".json", "text/csv"]));
});

for (const { file, mimeType, sheet } of IMPORTABLE) {
  test(`imports German contacts from ${file}`, async ({ page, companyId }) => {
    test.setTimeout(180000);
    const errors = collectPageErrors(page);
    const dialog = await openImport(page, companyId);
    await dialog
      .locator('input[type="file"]')
      .setInputFiles({ name: file, mimeType, buffer: readFileSync(`${FIXTURES}/${file}`) });
    await expect(dialog).toContainText("Step 1 of 5");
    await expect(dialog).toContainText(`${sheet}: 2 rows and 6 columns.`);
    await dialog.getByRole("button", { name: "Next", exact: true }).click();

    await expect(dialog).toContainText("Step 2 of 5");
    for (const [column, field] of [
      [0, "First name"],
      [1, "Last name"],
    ] as const) {
      await dialog.locator(`#xlsx-import-target-${column}`).click();
      await page.getByRole("option", { name: field, exact: true }).click();
    }
    await dialog.getByRole("button", { name: "Next", exact: true }).click();
    await expect(dialog).toContainText("Step 3 of 5");
    await expect(dialog).toContainText("Jürgen");
    await expect(dialog).toContainText("Strauß");
    await dialog.getByRole("button", { name: "Next", exact: true }).click();

    await expect(dialog).toContainText("Step 4 of 5");
    await dialog.getByRole("button", { name: "Import records", exact: true }).click();
    await expect(dialog.getByTestId("xlsx-import-summary")).toContainText("2 records created", { timeout: 60000 });
    await dialog.locator("#xlsx-import-save").click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByText("Jürgen Müller", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Ölaf Strauß", { exact: true }).first()).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test("explains how to convert a legacy Excel 97-2004 workbook", async ({ page, companyId }) => {
  const dialog = await openImport(page, companyId);
  await dialog.locator('input[type="file"]').setInputFiles({
    name: "legacy-biff8.xls",
    mimeType: "application/vnd.ms-excel",
    buffer: readFileSync(`${FIXTURES}/legacy-biff8.xls`),
  });
  await expect(dialog).toContainText("Excel 97-2004 workbooks (.xls) can't be read.");
});
