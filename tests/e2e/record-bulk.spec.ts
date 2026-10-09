import { randomUUID } from "node:crypto";
import { RecordModelSchema } from "../../features/records/record-model.schema";
import { RecordOperationResultSchema } from "../../features/records/record-query.schema";
import { test, expect, isAppConsoleError, isBenignPageError } from "./fixtures";
import { applyPaletteSearch, clearPaletteSearch } from "./filter-palette";
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
    if (!isBenignPageError(error.message)) errors.push(error.message);
  });
  page.on("console", (message) => {
    if (isAppConsoleError(message)) errors.push(message.text());
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
    await expect(page.getByRole("link", { name, exact: true })).toBeVisible();
  }
  const select = async () => {
    for (const name of ["Selected A", "Selected B"])
      await page
        .getByRole("row")
        .filter({ has: page.getByRole("link", { name, exact: true }) })
        .getByRole("checkbox")
        .check();
    await expect(page.locator("[data-record-mass-actions]")).toContainText("2 items selected");
  };
  await select();
  await page.locator("[data-record-mass-actions]").getByRole("button", { name: "Edit", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Edit", exact: true })
    .getByRole("button", { name: "Price", exact: true })
    .click();
  await page.getByRole("textbox", { name: "Price", exact: false }).fill("17.125");
  await page
    .getByRole("dialog", { name: "Edit", exact: true })
    .getByRole("button", { name: "Save", exact: true })
    .click();
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
  await expect(page.getByRole("link", { name: "Selected A", exact: true })).not.toBeVisible();
  await expect(page.getByRole("link", { name: "Selected B", exact: true })).not.toBeVisible();
  await expect(page.getByRole("link", { name: "Unselected C", exact: true })).toBeVisible();
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
    await expect(page.getByRole("link", { name, exact: true })).toBeVisible();
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
  await page.locator("[data-record-mass-actions]").getByRole("button", { name: "Edit", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Edit", exact: true })
    .getByRole("button", { name: "Price", exact: true })
    .click();
  await page.getByRole("textbox", { name: "Price", exact: false }).fill("50");
  await page
    .getByRole("dialog", { name: "Edit", exact: true })
    .getByRole("button", { name: "Save", exact: true })
    .click();
  await expect(page.locator("[data-sonner-toast]")).toContainText("changed");
  await expect(page.locator("[data-record-mass-actions]")).toContainText("2 items selected");
  const prices = await database.query(
    'SELECT trim_scale("decimalValue")::text AS price FROM "RecordValue" WHERE "companyId"=$1 AND "typeId"=$2 AND "fieldId"=$3 ORDER BY "decimalValue"',
    [companyId, typeId, presetId(companyId, "service.amount")],
  );
  expect(prices.rows).toEqual([{ price: "10" }, { price: "99" }]);
  await other.close();
});

test("retains off-view selections, keeps visible rows, clears selection and clears only the selected optional field", async ({
  page,
  database,
  companyId,
  workspace,
}, testInfo) => {
  test.setTimeout(180000);
  const typeId = presetId(companyId, "service");
  const nameId = presetId(companyId, "service.name");
  const amountId = presetId(companyId, "service.amount");
  const discountId = randomUUID();
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    if (!isBenignPageError(error.message)) errors.push(error.message);
  });
  page.on("console", (message) => {
    if (isAppConsoleError(message)) errors.push(message.text());
  });
  const post = async (path: string, data: unknown) => {
    const response = await page.request.post(path, { data });
    expect(response.status(), await response.text()).toBe(200);
    return response.json();
  };
  const model = RecordModelSchema.parse(await post("/api/v1/model/discover", {}));
  await post("/api/v1/model/apply", {
    expectedRevision: model.revision,
    idempotencyKey: randomUUID(),
    operations: [
      {
        operation: "putField",
        field: {
          id: discountId,
          typeId,
          label: "Optional discount",
          valueType: "number",
          behavior: { kind: "input" },
          required: false,
          archived: false,
          options: [],
          position: 20,
        },
      },
    ],
  });
  const refs: string[] = [];
  for (const [name, discount] of [
    ["Selected A", "1.25"],
    ["Selected B", "2.5"],
    ["Other C", "3.75"],
  ]) {
    const result = RecordOperationResultSchema.parse(
      await post("/api/v1/records/mutate", {
        expectedRevision: model.revision + 1,
        idempotencyKey: randomUUID(),
        mutation: {
          action: "create",
          typeId,
          fields: [
            { fieldId: nameId, value: { kind: "text", value: name } },
            { fieldId: amountId, value: { kind: "decimal", value: "10", currency: "EUR" } },
            { fieldId: discountId, value: { kind: "decimal", value: discount, currency: null } },
          ],
        },
      }),
    );
    if (result.status !== "completed") throw new Error("The bulk-control fixture must complete synchronously");
    const ref = result.refs.find((candidate) => candidate.typeId === typeId);
    if (!ref) throw new Error("The bulk-control record fixture is missing");
    refs.push(ref.recordId);
  }
  const read = async () =>
    (
      await database.query(
        'SELECT r.id,r.version,n."textValue" AS name,d.state,trim_scale(d."decimalValue")::text AS discount FROM "CrmRecord" r JOIN "RecordValue" n ON n."companyId"=r."companyId" AND n."typeId"=r."typeId" AND n."recordId"=r.id AND n."fieldId"=$3 JOIN "RecordValue" d ON d."companyId"=r."companyId" AND d."typeId"=r."typeId" AND d."recordId"=r.id AND d."fieldId"=$4 WHERE r."companyId"=$1 AND r."typeId"=$2 ORDER BY n."textValue"',
        [companyId, typeId, nameId, discountId],
      )
    ).rows;
  const initial = await read();
  expect(initial).toHaveLength(3);
  await page.goto(`/en/records/${typeId}`);
  const selection = page.locator("[data-record-mass-actions]");
  const row = (name: string) => page.getByRole("row").filter({ has: page.getByRole("link", { name, exact: true }) });
  const selectPair = async () => {
    for (const name of ["Selected A", "Selected B"]) await row(name).getByRole("checkbox").check();
    await expect(selection).toContainText("2 items selected");
  };
  await selectPair();
  await applyPaletteSearch(page, "records-filter", "Selected A");
  await expect(page.getByRole("link", { name: "Selected A", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Selected B", exact: true })).toHaveCount(0);
  await expect(selection).toContainText("1 not in the current view");
  await selection.getByRole("button", { name: "Keep only rows in view", exact: true }).click();
  await expect(selection).toContainText("1 item selected");
  await expect(row("Selected A").getByRole("checkbox")).toBeChecked();
  await expect(selection).not.toContainText("not in the current view");
  expect(await read()).toEqual(initial);
  await selection.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(selection).not.toBeVisible();
  await expect(row("Selected A").getByRole("checkbox")).not.toBeChecked();
  expect(await read()).toEqual(initial);
  await clearPaletteSearch(page, "records-filter");
  await expect(page.getByRole("link", { name: "Other C", exact: true })).toBeVisible();
  await expect(row("Selected B").getByRole("checkbox")).not.toBeChecked();
  await selectPair();
  await applyPaletteSearch(page, "records-filter", "Other C");
  await expect(page.getByRole("link", { name: "Selected A", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Selected B", exact: true })).toHaveCount(0);
  await expect(selection).toContainText("2 items selected");
  await expect(selection).toContainText("2 not in the current view");
  await selection.getByRole("button", { name: "Edit", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Edit", exact: true })
    .getByRole("button", { name: "Optional discount", exact: true })
    .click();
  await page.getByRole("button", { name: "Clear field", exact: true }).click();
  await expect(selection).not.toBeVisible();
  const cleared = await read();
  for (const original of initial) {
    const current = cleared.find((record) => record.id === original.id);
    if (!current) throw new Error("The bulk-control record must remain present");
    if (refs.slice(0, 2).includes(original.id))
      expect(current).toEqual({ ...original, state: "missing", discount: null, version: original.version + 1 });
    else expect(current).toEqual(original);
  }
  await clearPaletteSearch(page, "records-filter");
  await expect(row("Selected A").getByRole("checkbox")).not.toBeChecked();
  const discountColumn = (await page.getByRole("columnheader").allTextContents()).findIndex((label) =>
    label.includes("Optional discount"),
  );
  if (discountColumn < 0) throw new Error("The optional discount column must be visible");
  for (const name of ["Selected A", "Selected B"]) {
    const cell = row(name).getByRole("cell").nth(discountColumn);
    await expect(cell).toHaveText("");
    await expect(cell.locator("[data-empty-value]")).toHaveCount(1);
  }
  await expect(row("Other C").getByRole("cell").nth(discountColumn)).toHaveText("3.75");
  await expect(page).toHaveURL((url) => !url.searchParams.has("searchTerm"));
  await expect
    .poll(async () => {
      const saved = await database.query(
        'SELECT "searchTerm" FROM "P13n" WHERE "companyId"=$1 AND "userId"=$2 AND "p13nId"=$3',
        [companyId, workspace.userId, `records:${typeId}`],
      );
      return saved.rows.length === 1 && !saved.rows[0].searchTerm;
    })
    .toBe(true);
  await page.screenshot({ path: testInfo.outputPath("bulk-clear-off-view.png"), animations: "disabled" });
  await page.reload();
  await expect(page.getByRole("link", { name: "Selected A", exact: true })).toBeVisible();
  await expect(selection).not.toBeVisible();
  expect(await read()).toEqual(cleared);
  expect(errors).toEqual([]);
});
