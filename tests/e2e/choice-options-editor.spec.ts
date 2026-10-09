import type { Page } from "@playwright/test";
import type { Client } from "pg";
import { randomUUID } from "node:crypto";
import { presetId } from "../../features/records/crm-preset";
import { RecordModelSchema } from "../../features/records/record-model.schema";
import {
  addFromConfigure,
  configureDrawer,
  openConfigure,
  openConfigureRow,
  openDrawerTab,
  saveDrawer,
} from "./configure";
import { expect, test } from "./fixtures";

async function savedOptions(database: Client, companyId: string, label: string) {
  const { rows } = await database.query(
    'SELECT snapshot FROM "RecordSchemaRevision" WHERE "companyId"=$1 ORDER BY revision DESC LIMIT 1',
    [companyId],
  );
  const model = RecordModelSchema.parse(rows[0].snapshot);
  return model.fields.find((field) => field.label === label)?.options ?? [];
}

function optionNames(page: Page) {
  return configureDrawer(page)
    .locator("[data-option-row]")
    .getByRole("textbox", { name: "Option", exact: true })
    .evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value));
}

async function moveByKeyboard(page: Page, option: string, key: "ArrowUp" | "ArrowDown") {
  await configureDrawer(page)
    .getByRole("button", { name: `Drag to reorder: ${option}`, exact: true })
    .focus();
  await page.keyboard.press("Space");
  await page.keyboard.press(key);
  await page.keyboard.press("Space");
}

async function moveByDrag(page: Page, option: string, target: string) {
  const drawer = configureDrawer(page);
  const handle = await drawer.getByRole("button", { name: `Drag to reorder: ${option}`, exact: true }).boundingBox();
  const over = await drawer.getByRole("button", { name: `Drag to reorder: ${target}`, exact: true }).boundingBox();
  if (!handle || !over) throw new Error("Missing drag handles");
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2, handle.y - 8, { steps: 4 });
  await page.mouse.move(over.x + over.width / 2, over.y + 2, { steps: 10 });
  await page.mouse.up();
}

test("reorders choice options by drag and keyboard and edits attribute columns", async ({
  page,
  database,
  companyId,
}) => {
  test.setTimeout(240000);
  const typeId = presetId(companyId, "organization");
  const label = `Tier ${randomUUID().slice(0, 6)}`;
  const drawer = configureDrawer(page);
  const popover = page.locator('[data-slot="popover-content"]');
  await openConfigure(page, typeId);
  await addFromConfigure(page, "Field");
  await drawer.getByRole("textbox", { name: "Name", exact: false }).fill(label);
  await drawer.getByRole("combobox", { name: "Value type", exact: true }).click();
  await page.getByRole("option", { name: "Single choice", exact: true }).click();
  await openDrawerTab(page, "Options");
  for (const [index, option] of ["Bronze", "Silver", "Gold"].entries()) {
    await drawer.getByRole("button", { name: "Add option", exact: true }).click();
    await drawer.locator(`[id="choices.options.${index}.label"]`).fill(option);
  }

  await moveByKeyboard(page, "Gold", "ArrowUp");
  await expect.poll(() => optionNames(page)).toEqual(["Bronze", "Gold", "Silver"]);
  await moveByDrag(page, "Silver", "Bronze");
  await expect.poll(() => optionNames(page)).toEqual(["Silver", "Bronze", "Gold"]);

  await drawer.getByRole("button", { name: "Add attribute", exact: true }).click();
  await popover.getByRole("textbox", { name: "Attribute name", exact: true }).fill("Discount");
  await popover.getByRole("button", { name: "Save", exact: true }).click();
  await drawer.getByRole("button", { name: "Add attribute", exact: true }).click();
  await popover.getByRole("textbox", { name: "Attribute name", exact: true }).fill("discount");
  await popover.getByRole("button", { name: "Save", exact: true }).click();
  await expect(popover.getByRole("textbox", { name: "Attribute name", exact: true })).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await expect(page.getByText("Another attribute already has this name")).toBeVisible();
  await popover.getByRole("button", { name: "Cancel", exact: true }).click();
  await drawer.getByRole("button", { name: "Add attribute", exact: true }).click();
  await popover.getByRole("textbox", { name: "Attribute name", exact: true }).fill("Code");
  await popover.getByRole("combobox", { name: "Value type", exact: true }).click();
  await page.getByRole("option", { name: "Text", exact: true }).click();
  await popover.getByRole("button", { name: "Save", exact: true }).click();
  await expect(drawer.locator("[data-option-column]")).toHaveText(["Discount", "Code"]);
  await drawer.getByRole("textbox", { name: "Discount", exact: true }).nth(1).fill("5");
  await drawer.getByRole("textbox", { name: "Code", exact: true }).first().fill("S");

  await drawer.getByRole("button", { name: "More actions for Code", exact: true }).click();
  await page.getByRole("menuitem", { name: "Rename", exact: true }).click();
  await popover.getByRole("textbox", { name: "Attribute name", exact: true }).fill("Short code");
  await page.keyboard.press("Enter");
  await expect(drawer.locator("[data-option-column]")).toHaveText(["Discount", "Short code"]);
  await drawer.getByRole("button", { name: "More actions for Discount", exact: true }).click();
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  await expect(drawer.locator("[data-option-column]")).toHaveText(["Short code"]);
  await saveDrawer(page);

  await expect
    .poll(async () =>
      (await savedOptions(database, companyId, label)).map((option) => [option.label, option.attributes]),
    )
    .toEqual([
      ["Silver", [{ key: "Short code", value: { kind: "text", value: "S" } }]],
      ["Bronze", []],
      ["Gold", []],
    ]);

  await openConfigureRow(page, "Fields", label);
  await openDrawerTab(page, "Options");
  await expect.poll(() => optionNames(page)).toEqual(["Silver", "Bronze", "Gold"]);
  await moveByKeyboard(page, "Silver", "ArrowDown");
  await expect.poll(() => optionNames(page)).toEqual(["Bronze", "Silver", "Gold"]);
  await drawer.getByRole("button", { name: "More actions for Gold", exact: true }).click();
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  await saveDrawer(page);
  await expect
    .poll(async () => (await savedOptions(database, companyId, label)).map((option) => option.label))
    .toEqual(["Bronze", "Silver"]);

  await page.setViewportSize({ width: 390, height: 844 });
  await openConfigureRow(page, "Fields", label);
  await openDrawerTab(page, "Options");
  const editor = drawer.locator("[data-option-editor]");
  await expect(editor).toBeVisible();
  expect(await editor.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  const name = await drawer.locator('[id="choices.options.0.label"]').boundingBox();
  const cell = await drawer.getByRole("textbox", { name: "Short code", exact: true }).first().boundingBox();
  if (!name || !cell) throw new Error("Missing option row controls");
  expect(cell.y).toBeGreaterThanOrEqual(name.y + name.height);
});
