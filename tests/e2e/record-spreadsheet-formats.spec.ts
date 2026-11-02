import { readFileSync } from "node:fs";

import ExcelJS from "exceljs";
import * as XLSX from "xlsx";

import { companyPath } from "./app-paths";
import { test, expect, collectPageErrors } from "./fixtures";
import { presetId } from "../../features/records/crm-preset";

const FIXTURES = "tests/fixtures/spreadsheet-import";

// Each file holds the same two German contacts, saved the way Excel for Mac, Excel for Windows, LibreOffice and web
// applications write them (see tests/fixtures/spreadsheet-import/README.md). mimeType is what browsers send for the file: Safari and Chrome on macOS send text/csv for CSV,
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
  { file: "legacy-biff8.xls", mimeType: "application/vnd.ms-excel", sheet: "contacts" },
  { file: "excel95-biff5.xls", mimeType: "application/vnd.ms-excel", sheet: "contacts" },
  { file: "xml-2003.xls", mimeType: "application/vnd.ms-excel", sheet: "contacts" },
  { file: "html-table.xls", mimeType: "application/vnd.ms-excel", sheet: "Sheet1" },
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

test("imports the contacts sheet of a workbook saved by Microsoft Excel", async ({ page, companyId }) => {
  test.setTimeout(180000);
  const errors = collectPageErrors(page);
  const dialog = await openImport(page, companyId);
  await dialog.locator('input[type="file"]').setInputFiles({
    name: "crm-template-de.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: readFileSync("public/templates/crm-template-de.xlsx"),
  });
  await expect(dialog).toContainText("Step 1 of 5");
  await dialog.locator("#xlsx-import-sheet").click();
  await page.getByRole("option", { name: "Kontakte", exact: true }).click();
  await expect(dialog).toContainText("Kontakte: 2 rows and 4 columns.");
  await dialog.getByRole("button", { name: "Next", exact: true }).click();

  await expect(dialog).toContainText("Step 2 of 5");
  for (const [column, field] of [
    [0, "Skip column"],
    [1, "First name"],
    [2, "Skip column"],
  ] as const) {
    await dialog.locator(`#xlsx-import-target-${column}`).click();
    await page.getByRole("option", { name: field, exact: true }).click();
  }
  await dialog.getByRole("button", { name: "Next", exact: true }).click();
  await expect(dialog).toContainText("Step 3 of 5");
  await dialog.getByRole("button", { name: "Next", exact: true }).click();
  await expect(dialog).toContainText("Step 4 of 5");
  await dialog.getByRole("button", { name: "Import records", exact: true }).click();
  await expect(dialog.getByTestId("xlsx-import-summary")).toContainText("2 records created", { timeout: 60000 });
  expect(errors).toEqual([]);
});

test("imports a workbook saved by Excel 16 for Mac", async ({ page, companyId }) => {
  test.setTimeout(180000);
  const errors = collectPageErrors(page);
  const dialog = await openImport(page, companyId);
  await dialog.locator('input[type="file"]').setInputFiles({
    name: "excel-mac-16.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: readFileSync(`${FIXTURES}/excel-mac-16.xlsx`),
  });
  await expect(dialog).toContainText("File: 2 rows and 3 columns.");
  await dialog.getByRole("button", { name: "Next", exact: true }).click();
  await expect(dialog).toContainText("Step 2 of 5");
  for (const [column, field] of [
    [0, "First name"],
    [1, "Skip column"],
    [2, "Skip column"],
  ] as const) {
    await dialog.locator(`#xlsx-import-target-${column}`).click();
    await page.getByRole("option", { name: field, exact: true }).click();
  }
  await dialog.getByRole("button", { name: "Next", exact: true }).click();
  await expect(dialog).toContainText("Step 3 of 5");
  await dialog.getByRole("button", { name: "Next", exact: true }).click();
  await dialog.getByRole("button", { name: "Import records", exact: true }).click();
  await expect(dialog.getByTestId("xlsx-import-summary")).toContainText("2 records created", { timeout: 60000 });
  expect(errors).toEqual([]);
});

const LIMIT_ROWS = 5000;
const bulkRows = (count: number) => [
  ["First name", "Last name"],
  ...Array.from({ length: count }, (_, index) => [`Bulk${index + 1}`, "Größe"]),
];

test("imports a CSV file with the most rows a list import takes", async ({ page, companyId, database }) => {
  test.setTimeout(900000);
  const errors = collectPageErrors(page);
  const countContacts = async () =>
    (
      await database.query(`SELECT COUNT(*)::integer AS count FROM "CrmRecord" WHERE "companyId"=$1 AND "typeId"=$2`, [
        companyId,
        presetId(companyId, "contact"),
      ])
    ).rows[0].count as number;
  const before = await countContacts();
  const dialog = await openImport(page, companyId);
  const csv = bulkRows(LIMIT_ROWS)
    .map((row) => row.join(";"))
    .join("\r\n");
  await dialog.locator('input[type="file"]').setInputFiles({
    name: "bulk.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(`\uFEFF${csv}`),
  });
  await expect(dialog).toContainText("bulk: 5,000 rows and 2 columns.");
  await dialog.getByRole("button", { name: "Next", exact: true }).click();
  await expect(dialog.locator("#xlsx-import-target-0")).toContainText("First name");
  await expect(dialog.locator("#xlsx-import-target-1")).toContainText("Last name");
  await dialog.getByRole("button", { name: "Next", exact: true }).click();
  await expect(dialog).toContainText("Step 3 of 5");
  await dialog.getByRole("button", { name: "Next", exact: true }).click();
  await dialog.getByRole("button", { name: "Import records", exact: true }).click();
  await expect(dialog.getByTestId("xlsx-import-summary")).toContainText("5,000 records created", { timeout: 780000 });
  expect((await countContacts()) - before).toBe(LIMIT_ROWS);
  expect(errors).toEqual([]);
});

test("reads .xlsx and .xls workbooks at the row limit and refuses files over the limits", async ({
  page,
  companyId,
}) => {
  test.setTimeout(300000);
  const dialog = await openImport(page, companyId);
  const input = dialog.locator('input[type="file"]');

  const book = new ExcelJS.Workbook();
  book.addWorksheet("Bulk").addRows(bulkRows(LIMIT_ROWS));
  await input.setInputFiles({
    name: "bulk.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from(await book.xlsx.writeBuffer()),
  });
  await expect(dialog).toContainText("Bulk: 5,000 rows and 2 columns.", { timeout: 60000 });

  const legacy = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(legacy, XLSX.utils.aoa_to_sheet(bulkRows(LIMIT_ROWS)), "Bulk");
  await input.setInputFiles({
    name: "bulk.xls",
    mimeType: "application/vnd.ms-excel",
    buffer: XLSX.write(legacy, { bookType: "biff8", type: "buffer" }) as Buffer,
  });
  await expect(dialog).toContainText("Bulk: 5,000 rows and 2 columns.", { timeout: 60000 });
  await expect(dialog).toContainText("bulk.xls");

  const over = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(over, XLSX.utils.aoa_to_sheet(bulkRows(LIMIT_ROWS + 1)), "Bulk");
  await input.setInputFiles({
    name: "over.xls",
    mimeType: "application/vnd.ms-excel",
    buffer: XLSX.write(over, { bookType: "biff8", type: "buffer" }) as Buffer,
  });
  await expect(dialog).toContainText("A sheet can hold at most 5000 rows.", { timeout: 60000 });

  await input.setInputFiles({
    name: "over.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(bulkRows(LIMIT_ROWS + 1).map((row) => row.join(",")).join("\n")),
  });
  await expect(dialog).toContainText("A sheet can hold at most 5000 rows.");

  await input.setInputFiles({
    name: "huge.csv",
    mimeType: "text/csv",
    buffer: Buffer.alloc(10 * 1024 * 1024 + 1, "a"),
  });
  await expect(dialog).toContainText("The workbook is larger than 10 MB.");
});
