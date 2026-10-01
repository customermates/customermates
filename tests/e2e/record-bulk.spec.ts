import { test, expect } from "./fixtures";
import { presetId } from "../../features/records/crm-preset";

test("selects records, bulk-edits exact decimals, previews cascades, and deletes only the selected records", async ({
  page,
  database,
  companyId,
}, testInfo) => {
  const typeId = presetId(companyId, "service");
  const priceId = presetId(companyId, "service.amount");
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    if (error.message !== "ResizeObserver loop completed with undelivered notifications.") errors.push(error.message);
  });
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto(`/en/records/${typeId}`);
  const dialog = page.getByRole("dialog");
  for (const [name, price] of [
    ["Selected A", "10"],
    ["Selected B", "20"],
    ["Unselected C", "30"],
  ]) {
    await page.locator("#records-add").click();
    await dialog.getByRole("textbox", { name: "Name", exact: false }).fill(name);
    await dialog.getByRole("textbox", { name: "Price", exact: false }).fill(price);
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByRole("button", { name, exact: true })).toBeVisible();
  }
  const select = async () => {
    for (const name of ["Selected A", "Selected B"])
      await page
        .getByRole("row")
        .filter({ has: page.getByRole("button", { name, exact: true }) })
        .getByRole("checkbox")
        .check();
    await expect(page.locator("[data-record-mass-actions]")).toContainText("2 items selected");
  };
  await select();
  await page.locator("[data-record-mass-actions]").getByRole("button", { name: "Update", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Update", exact: true })
    .getByRole("button", { name: "Price", exact: true })
    .click();
  await page.getByRole("textbox", { name: "Price", exact: false }).fill("17.125");
  await page.getByRole("button", { name: "Apply to selected", exact: true }).click();
  await expect(page.locator("[data-record-mass-actions]")).not.toBeVisible();
  const prices = () =>
    database.query(
      'SELECT name."textValue" AS name,trim_scale(price."decimalValue")::text AS price FROM "RecordValue" price JOIN "RecordValue" name ON name."companyId"=price."companyId" AND name."typeId"=price."typeId" AND name."recordId"=price."recordId" AND name."fieldId"=$4 WHERE price."companyId"=$1 AND price."typeId"=$2 AND price."fieldId"=$3 ORDER BY name."textValue"',
      [companyId, typeId, priceId, presetId(companyId, "service.name")],
    );
  expect((await prices()).rows).toEqual([
    { name: "Selected A", price: "17.125" },
    { name: "Selected B", price: "17.125" },
    { name: "Unselected C", price: "30" },
  ]);
  await select();
  await page.screenshot({
    path: testInfo.outputPath("record-bulk-selection.png"),
    animations: "disabled",
  });
  await page.locator("#mass-delete").click();
  const confirmation = page.getByRole("alertdialog");
  await expect(confirmation).toContainText("Services: 2");
  await confirmation.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByRole("button", { name: "Selected A", exact: true })).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Selected B", exact: true })).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Unselected C", exact: true })).toBeVisible();
  expect((await prices()).rows).toEqual([{ name: "Unselected C", price: "30" }]);
  expect(errors).toEqual([]);
});

test("shows a conflict and leaves every selected record unchanged when another tab updates its version", async ({
  page,
  context,
  database,
  companyId,
}) => {
  const typeId = presetId(companyId, "service");
  await page.goto(`/en/records/${typeId}`);
  const dialog = page.getByRole("dialog");
  for (const name of ["Concurrent A", "Concurrent B"]) {
    await page.locator("#records-add").click();
    await dialog.getByRole("textbox", { name: "Name", exact: false }).fill(name);
    await dialog.getByRole("textbox", { name: "Price", exact: false }).fill("10");
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByRole("button", { name, exact: true })).toBeVisible();
  }
  await page.getByRole("checkbox", { name: "Select all rows", exact: true }).check();
  const ref = (
    await database.query(
      'SELECT "recordId" FROM "RecordValue" WHERE "companyId"=$1 AND "typeId"=$2 AND "fieldId"=$3 AND "textValue"=$4',
      [companyId, typeId, presetId(companyId, "service.name"), "Concurrent B"],
    )
  ).rows[0].recordId;
  const other = await context.newPage();
  await other.bringToFront();
  await other.goto(`/en/records/${typeId}/${ref}`);
  const price = other.getByRole("main").getByRole("textbox", { name: "Price", exact: false });
  await expect(price).toHaveValue("10");
  await price.click();
  await price.fill("99");
  await expect(other.getByRole("main").getByRole("button", { name: "Save", exact: true })).toBeEnabled();
  await other.getByRole("main").getByRole("button", { name: "Save", exact: true }).click();
  await expect
    .poll(
      async () =>
        (
          await database.query(
            'SELECT trim_scale("decimalValue")::text AS price FROM "RecordValue" WHERE "companyId"=$1 AND "typeId"=$2 AND "recordId"=$3 AND "fieldId"=$4',
            [companyId, typeId, ref, presetId(companyId, "service.amount")],
          )
        ).rows[0]?.price,
    )
    .toBe("99");
  await page.bringToFront();
  await page.locator("[data-record-mass-actions]").getByRole("button", { name: "Update", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Update", exact: true })
    .getByRole("button", { name: "Price", exact: true })
    .click();
  await page.getByRole("textbox", { name: "Price", exact: false }).fill("50");
  await page.getByRole("button", { name: "Apply to selected", exact: true }).click();
  await expect(page.locator("[data-sonner-toast]")).toContainText("changed");
  await expect(page.locator("[data-record-mass-actions]")).toContainText("2 items selected");
  const prices = await database.query(
    'SELECT trim_scale("decimalValue")::text AS price FROM "RecordValue" WHERE "companyId"=$1 AND "typeId"=$2 AND "fieldId"=$3 ORDER BY "decimalValue"',
    [companyId, typeId, presetId(companyId, "service.amount")],
  );
  expect(prices.rows).toEqual([{ price: "10" }, { price: "99" }]);
  await other.close();
});
