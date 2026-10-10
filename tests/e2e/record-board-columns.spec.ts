import { randomUUID } from "node:crypto";

import { test, expect, isAppConsoleError, isBenignPageError } from "./fixtures";
import { presetId } from "../../features/records/crm-preset";

test("board columns add a record with the column value, open the option, and collapse into strips", async ({
  page,
  database,
  companyId,
}, testInfo) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    if (!isBenignPageError(error.message)) errors.push(error.message);
  });
  page.on("console", (message) => {
    if (isAppConsoleError(message)) errors.push(message.text());
  });
  const id = (key: string) => presetId(companyId, key);
  const typeId = id("deal");
  const column = (option: string) => page.locator(`[data-group-key="value:${id(`deal.stage.${option}`)}"]`);
  await page.goto(`/en/records/${typeId}`);
  const model = await (await page.request.post("/api/v1/model/discover", { data: {} })).json();
  const created = await page.request.post("/api/v1/records/mutate", {
    data: {
      expectedRevision: model.revision,
      idempotencyKey: randomUUID(),
      mutation: {
        action: "create",
        typeId,
        fields: [
          { fieldId: id("deal.name"), value: { kind: "text", value: "Column seed" } },
          { fieldId: id("deal.stage"), value: { kind: "select", value: id("deal.stage.new") } },
        ],
      },
    },
  });
  expect(created.status(), await created.text()).toBe(200);

  await page.reload();
  await page.getByRole("button", { name: "Appearance", exact: true }).click();
  await page.locator("#records-layout-board").click();
  if (testInfo.project.name === "mobile") await page.locator('[data-slot="drawer-close"]').click();
  else await page.keyboard.press("Escape");
  await expect(column("new")).not.toHaveAttribute("data-kanban-strip");
  await expect(column("new")).toContainText("Column seed");

  const won = column("won");
  await expect(won).toHaveAttribute("data-kanban-strip", "");
  await expect(won).toHaveAccessibleName("Expand Won, 0 Deals");
  await expect(won.locator("[aria-label]")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("board-strips.png"), animations: "disabled" });
  await won.click();
  await expect(won).not.toHaveAttribute("data-kanban-strip");
  await won.getByRole("button", { name: "More actions for Won", exact: true }).click();
  await page.getByRole("menuitem", { name: "Collapse column", exact: true }).click();
  await expect(won).toHaveAttribute("data-kanban-strip", "");

  const open = column("new");
  await open.getByRole("button", { name: "More actions for New", exact: true }).click();
  await expect(page.getByRole("menuitem")).toHaveText(["Edit option", "Collapse column", "Hide column"]);
  await page.screenshot({ path: testInfo.outputPath("board-column-menu.png"), animations: "disabled" });
  await page.getByRole("menuitem", { name: "Collapse column", exact: true }).click();
  await expect(open).toHaveAttribute("data-kanban-strip", "");
  await expect(open).toHaveAccessibleName("Expand New, 1 Deal");
  await open.click();
  await expect(open).toContainText("Column seed");

  const add = open.getByRole("button", { name: "Add Deal", exact: true });
  await open.hover();
  await add.hover();
  await expect(page.getByRole("tooltip")).toHaveText("Add Deal");
  await page.screenshot({ path: testInfo.outputPath("board-column-add.png"), animations: "disabled" });
  await add.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("combobox", { name: "Stage", exact: true })).toContainText("New");
  await dialog.getByRole("textbox", { name: "Name", exact: false }).fill("Added from the column");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect
    .poll(async () => {
      const result = await database.query(
        `SELECT value."textValue" FROM "CrmRecord" record
         JOIN "RecordValue" name ON name."companyId" = record."companyId" AND name."recordId" = record.id AND name."fieldId" = $3
         JOIN "RecordValue" value ON value."companyId" = record."companyId" AND value."recordId" = record.id AND value."fieldId" = $4
         WHERE record."companyId" = $1 AND record."typeId" = $2 AND name."textValue" = 'Added from the column'`,
        [companyId, typeId, id("deal.name"), id("deal.stage")],
      );
      return result.rows[0]?.textValue;
    })
    .toBe(id("deal.stage.new"));
  await expect(open).toContainText("Added from the column");

  const appearance = async (action: () => Promise<void>) => {
    await page.getByRole("button", { name: "Appearance", exact: true }).click();
    await action();
    if (testInfo.project.name === "mobile") await page.locator('[data-slot="drawer-close"]').click();
    else await page.keyboard.press("Escape");
    await expect(page.getByRole("heading", { name: "Appearance", exact: true })).not.toBeVisible();
  };
  const storedGrouping = async () =>
    (
      await database.query('SELECT grouping FROM "P13n" WHERE "companyId"=$1 AND "p13nId"=$2', [
        companyId,
        `records:${typeId}`,
      ])
    ).rows[0]?.grouping;
  await open.getByRole("button", { name: "More actions for New", exact: true }).click();
  await page.getByRole("menuitem", { name: "Hide column", exact: true }).click();
  await expect(open).toHaveCount(0);
  await expect.poll(storedGrouping).toMatchObject({ hidden: [`value:${id("deal.stage.new")}`] });
  await page.reload();
  await expect(won).toHaveAttribute("data-kanban-strip", "");
  await expect(open).toHaveCount(0);
  await appearance(async () => {
    await expect(page.getByText("Hidden columns", { exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("board-hidden-columns.png"), animations: "disabled" });
    await page.getByRole("checkbox", { name: "New", exact: true }).click();
    await expect(page.getByText("Hidden columns", { exact: true })).toHaveCount(0);
  });
  await expect(open).toContainText("Added from the column");
  await expect.poll(async () => (await storedGrouping())?.hidden).toBeUndefined();

  await appearance(() => page.getByRole("switch", { name: "Hide empty columns", exact: true }).click());
  await expect(won).toHaveCount(0);
  await expect(open).toContainText("Column seed");
  await expect.poll(storedGrouping).toMatchObject({ hideEmpty: true });
  await page.reload();
  await expect(open).toContainText("Column seed");
  await expect(won).toHaveCount(0);
  await appearance(() => page.getByRole("switch", { name: "Hide empty columns", exact: true }).click());
  await expect(won).toHaveAttribute("data-kanban-strip", "");
  await expect.poll(async () => (await storedGrouping())?.hideEmpty).toBeUndefined();

  const optionRow = page.locator(`[data-focus-target="option:${id("deal.stage")}.${id("deal.stage.new")}"]`);
  await open.getByRole("button", { name: "More actions for New", exact: true }).click();
  await page.getByRole("menuitem", { name: "Edit option", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/configure\\?typeId=${typeId}&tab=fields`));
  await expect(optionRow).toBeVisible();
  await expect(optionRow).toHaveAttribute("data-focus-highlight", "");
  await page.screenshot({ path: testInfo.outputPath("board-edit-option.png"), animations: "disabled" });

  await page.goto(`/en/records/${typeId}`);
  const chip = open.locator("[data-kanban-edit-option]");
  await expect(chip).toHaveText("New");
  await open.hover();
  await chip.hover();
  await expect(page.getByRole("tooltip")).toHaveText("Edit field");
  await page.mouse.move(0, 0);
  await chip.focus();
  await expect(page.getByRole("tooltip")).toHaveText("Edit field");
  await page.keyboard.press("Enter");
  await expect(optionRow).toBeVisible();
  await expect(optionRow).toHaveAttribute("data-focus-highlight", "");
  expect(errors).toEqual([]);
});
