import ExcelJS from "exceljs";

import { test, expect, collectPageErrors } from "./fixtures";
import { openRecordDetails } from "./record-rows";
import { presetId } from "../../features/records/crm-preset";


async function workbook(rows: unknown[][], sheetName = "Deals"): Promise<Buffer> {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet(sheetName);
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

test("imports the email and phone columns of an Excel file into contact details", async ({
  page,
  database,
  companyId,
}) => {
  test.setTimeout(180000);
  const errors = collectPageErrors(page);
  const contact = presetId(companyId, "contact");
  await page.goto(`/en/records/${contact}`);
  await page.locator("#records-more").click();
  await page.getByRole("menuitem", { name: "Add from file", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator('input[type="file"]').setInputFiles({
    name: "contacts.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: await workbook(
      [
        ["First name", "Last name", "E-Mail", "Mobile"],
        ["Grace", "Imported", "Grace@Example.test", "+49 170 1234567"],
        ["Linus", "Imported", "not an address", ""],
      ],
      "Contacts",
    ),
  });
  await expect(dialog).toContainText("Step 1 of 5");
  await dialog.getByRole("button", { name: "Next", exact: true }).click();

  await expect(dialog).toContainText("Step 2 of 5");
  await expect(dialog.locator("#xlsx-import-target-2")).toContainText("Contact details");
  await expect(dialog.locator("#xlsx-import-target-3")).toContainText("Contact details");
  await dialog.getByRole("button", { name: "Next", exact: true }).click();

  await expect(dialog).toContainText("Step 3 of 5");
  await expect(dialog).toContainText("“not an address” is not an email address, phone number or profile link.");
  await dialog.getByRole("button", { name: "Next", exact: true }).click();
  await expect(dialog).toContainText("Step 4 of 5");
  await dialog.getByRole("button", { name: "Import records", exact: true }).click();
  const summary = dialog.getByTestId("xlsx-import-summary");
  await expect(summary).toContainText("1 record created", { timeout: 60000 });
  await expect(summary).toContainText("1 row failed");
  await dialog.locator("#xlsx-import-save").click();
  await expect(dialog).not.toBeVisible();

  expect(
    (
      await database.query(
        'SELECT i.provider::text AS provider, i.value FROM "RecordIdentity" i JOIN "RecordIdentityLink" l ON l."companyId" = i."companyId" AND l."identityId" = i.id WHERE i."companyId" = $1 AND l."typeId" = $2',
        [companyId, contact],
      )
    ).rows.sort((left, right) => (left.provider < right.provider ? 1 : -1)),
  ).toEqual([
    { provider: "phone", value: "+491701234567" },
    { provider: "mail", value: "grace@example.test" },
  ]);
  await openRecordDetails(page, "Grace Imported");
  await expect(
    page
      .getByRole("dialog", { name: "Contact", exact: true })
      .locator('[data-record-channel-group="email"]')
      .getByRole("link", { name: "grace@example.test" }),
  ).toHaveAttribute("href", "mailto:grace@example.test");
  expect(errors).toEqual([]);
});
