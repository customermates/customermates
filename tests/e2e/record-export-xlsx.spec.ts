import { readFile } from "node:fs/promises";

import ExcelJS from "exceljs";

import { test, expect } from "./fixtures";
import { presetId } from "../../features/records/crm-preset";


const SPREADSHEET =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

async function servicesSheet(buffer: Buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const sheet = workbook.getWorksheet("Services");
  expect(sheet).toBeTruthy();
  const rows: unknown[][] = [];
  sheet!.eachRow((row) => rows.push((row.values as unknown[]).slice(1)));
  const [headers, ...values] = rows as [string[], ...unknown[][]];
  return { headers, values };
}

test("downloads a list as an Excel workbook from the menu and the record API", async ({
  page,
  companyId,
}) => {
  const typeId = presetId(companyId, "service");
  await page.goto(`/en/records/${typeId}`);
  await page.locator("#records-add").click();
  const editor = page.getByRole("dialog");
  await editor
    .getByRole("textbox", { name: "Name", exact: false })
    .fill("Workbook service");
  await editor
    .getByRole("textbox", { name: "Price", exact: false })
    .fill("1250");
  await editor.getByRole("button", { name: "Save", exact: true }).click();
  await expect(editor).not.toBeVisible();

  await page.locator("#records-more").click();
  await expect(
    page.getByRole("menuitem", { name: "Export as JSON", exact: true }),
  ).toBeVisible();
  const downloaded = page.waitForEvent("download", { timeout: 60000 });
  await page
    .getByRole("menuitem", { name: "Export as Excel (.xlsx)", exact: true })
    .click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toMatch(
    /^services-\d{4}-\d{2}-\d{2}\.xlsx$/,
  );
  const file = await download.path();
  expect(file).toBeTruthy();
  const fromMenu = await servicesSheet(await readFile(file!));
  expect(fromMenu.headers[0]).toBe("Name");
  expect(fromMenu.headers).toContain("Price (EUR)");
  expect(fromMenu.headers).toEqual(
    expect.arrayContaining(["Assigned to", "Created at", "Updated at"]),
  );
  expect(fromMenu.values).toHaveLength(1);
  const row = fromMenu.values[0];
  expect(row[0]).toBe("Workbook service");
  expect(row[fromMenu.headers.indexOf("Price (EUR)")]).toBe(1250);
  expect(row[fromMenu.headers.indexOf("Created at")]).toBeInstanceOf(Date);

  const response = await page.request.post("/api/v1/records/export", {
    data: { typeId, filters: [], relationships: [], sort: [], format: "xlsx" },
  });
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toBe(SPREADSHEET);
  expect(response.headers()["x-export-row-count"]).toBe("1");
  const fromApi = await servicesSheet(await response.body());
  expect(fromApi.headers).toEqual(fromMenu.headers);
  expect(fromApi.values[0][0]).toBe("Workbook service");
  expect(fromApi.values[0][fromApi.headers.indexOf("Price (EUR)")]).toBe(1250);

  const json = await page.request.post("/api/v1/records/export", {
    data: { typeId, filters: [], relationships: [], sort: [] },
  });
  expect(json.status()).toBe(200);
  expect(await json.json()).toMatchObject({
    format: "customermates-records",
    typeId,
  });
  await page.close();
});
