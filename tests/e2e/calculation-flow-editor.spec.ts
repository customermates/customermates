import type { Locator, Page } from "@playwright/test";
import type { Client } from "pg";
import { presetId } from "../../features/records/crm-preset";
import { RecordModelSchema } from "../../features/records/record-model.schema";
import { calculationChip, calculationFlow, chooseValueSource, pickOption } from "./calculation-flow";
import { addFromConfigure, openConfigure, openConfigureRow, openDrawerTab, saveDrawer } from "./configure";
import { expect, test, isAppConsoleError, isBenignPageError } from "./fixtures";

function captureErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    if (!isBenignPageError(error.message)) errors.push(error.message);
  });
  page.on("console", (message) => {
    if (isAppConsoleError(message)) errors.push(message.text());
  });
  return errors;
}

async function readModel(database: Client, companyId: string) {
  const result = await database.query(
    'SELECT snapshot FROM "RecordSchemaRevision" WHERE "companyId"=$1 ORDER BY revision DESC LIMIT 1',
    [companyId],
  );
  return RecordModelSchema.parse(result.rows[0]?.snapshot);
}

async function selectOption(page: Page, label: string, option: string) {
  await page.getByRole("dialog").getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

test("edits an existing snapshot as a lookup with an Updates mode and keeps its stored shape", async ({
  page,
  database,
  companyId,
}) => {
  const errors = captureErrors(page);
  const id = (key: string) => presetId(companyId, key);
  const dialog = page.getByRole("dialog");
  await openConfigure(page, id("lineItem"));
  const seeded = (await readModel(database, companyId)).fields.find((field) => field.id === id("lineItem.savedPrice"));
  await openConfigureRow(page, "Fields", "Saved unit price");
  await dialog.getByRole("textbox", { name: "Name", exact: false }).fill("Quoted unit price");
  await saveDrawer(page);
  const renamed = (await readModel(database, companyId)).fields.find((field) => field.id === id("lineItem.savedPrice"));
  expect(renamed?.label).toBe("Quoted unit price");
  expect(renamed?.behavior).toEqual(seeded?.behavior);
  await openConfigureRow(page, "Fields", "Quoted unit price");
  await openDrawerTab(page, "Calculation");
  const flow = calculationFlow(page);
  await expect(dialog.getByRole("combobox", { name: "Value source", exact: true })).toContainText(
    "Taken from a linked record",
  );
  await expect(flow).toHaveAttribute("data-calculation-flow", "lookup");
  await expect(calculationChip(page, "relationship")).toHaveText("Service · Many to one");
  await expect(flow.locator('[data-calculation-node="linked"]')).toContainText("Take");
  await expect(calculationChip(page, "value")).toHaveText("Price");
  await expect(flow.locator('[data-calculation-node="result"]')).toContainText("Money");
  await expect(flow.locator("[data-calculation-example]")).toBeVisible();
  await expect(flow.locator("[data-calculation-sentence]")).toHaveText(
    "Quoted unit price shows the Price of the linked Service. It is saved when Pricing changes to Saved price. People can type over it.",
  );
  const more = dialog.locator('[data-slot="collapsible-section-trigger"]').filter({ hasText: "More options" });
  await expect(more).toHaveAttribute("aria-expanded", "false");
  await expect(more).toContainText("Saved when a field changes");
  await openDrawerTab(page, "More options");
  await expect(dialog.getByRole("combobox", { name: "Updates", exact: true })).toContainText(
    "Saved when a field changes",
  );
  await expect(dialog.getByRole("switch", { name: "Let people type over it", exact: true })).toBeChecked();

  await selectOption(page, "Updates", "Saved on request");
  await expect(dialog.getByRole("combobox", { name: /^When this field changes/ })).toHaveCount(0);
  await saveDrawer(page);
  const saved = (await readModel(database, companyId)).fields.find((field) => field.id === id("lineItem.savedPrice"));
  expect(saved?.behavior).toEqual({
    kind: "snapshot",
    capture: "explicit",
    allowManualOverride: true,
    expression: {
      kind: "related",
      relationId: id("lineItem.service"),
      direction: "outgoing",
      reducer: "one",
      expression: { kind: "field", fieldId: id("service.amount") },
    },
  });

  await openConfigureRow(page, "Fields", "Quoted unit price");
  await openDrawerTab(page, "More options");
  await selectOption(page, "Updates", "Always up to date");
  await expect(dialog.getByRole("switch", { name: "Let people type over it", exact: true })).toHaveCount(0);
  await saveDrawer(page);
  expect(
    (await readModel(database, companyId)).fields.find((field) => field.id === id("lineItem.savedPrice"))?.behavior,
  ).toEqual({
    kind: "lookup",
    expression: {
      kind: "related",
      relationId: id("lineItem.service"),
      direction: "outgoing",
      reducer: "one",
      expression: { kind: "field", fieldId: id("service.amount") },
    },
  });
  expect(errors).toEqual([]);
});

test("names what is missing and refuses to save an incomplete flow", async ({ page, database, companyId }) => {
  const errors = captureErrors(page);
  const dialog = page.getByRole("dialog");
  await openConfigure(page, presetId(companyId, "deal"));
  await addFromConfigure(page, "Calculated field");
  await dialog.getByRole("textbox", { name: "Name", exact: false }).fill("Open total");
  await chooseValueSource(page, "Counted or totalled from linked records");
  const flow = calculationFlow(page);
  await expect(flow.locator("[data-calculation-sentence]")).toHaveText("Pick which linked records to use.");
  await pickOption(page, calculationChip(page, "pick-relationship"), "Line items · One to many");
  await expect(flow.locator("[data-calculation-sentence]")).toHaveText("Pick which value to add up.");
  await dialog.getByRole("button", { name: "Save", exact: true }).first().click();
  const linked = flow.locator('[data-calculation-node="linked"]');
  await expect(linked).toHaveAttribute("data-calculation-invalid", "true");
  await expect(calculationChip(page, "pick-field")).toBeFocused();
  await expect(page.getByText("Pick which value to add up.", { exact: true })).toHaveCount(1);
  await expect(flow.locator("[data-calculation-sentence]")).toHaveCount(0);
  await expect(page.locator("[data-sonner-toast]")).toHaveCount(0);
  await expect(dialog.getByRole("status")).toHaveCount(0);
  await expect(dialog).toBeVisible();
  expect((await readModel(database, companyId)).fields.some((field) => field.label === "Open total")).toBe(false);

  await pickOption(page, calculationChip(page, "aggregate"), "Number");
  await expect(linked).toContainText("of linked Line items");
  await expect(calculationChip(page, "pick-field")).toHaveCount(0);
  await expect(flow.locator("[data-calculation-sentence]")).toHaveText("Open total counts the linked Line items.");
  await expect(flow.locator('[data-calculation-node="result"]')).toContainText("Number");
  await expect(linked).not.toHaveAttribute("data-calculation-invalid", "true");

  await openDrawerTab(page, "More options");
  await selectOption(page, "Updates", "Saved when a field changes");
  await dialog.getByRole("button", { name: "Save", exact: true }).first().click();
  const trigger = dialog.getByRole("combobox", { name: /^When this field changes/ });
  await expect(trigger).toHaveAttribute("aria-invalid", "true");
  await expect(trigger).toBeFocused();
  await expect(dialog.getByText("Pick the field that triggers saving.", { exact: true })).toBeVisible();
  await expect(page.locator("[data-sonner-toast]")).toHaveCount(0);
  expect((await readModel(database, companyId)).fields.some((field) => field.label === "Open total")).toBe(false);
  expect(errors).toEqual([]);
});

test("fits the flow and its picker to a phone screen", async ({ page, companyId }) => {
  const errors = captureErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await openConfigure(page, presetId(companyId, "deal"));
  await openConfigureRow(page, "Fields", "Weighted value");
  await openDrawerTab(page, "Calculation");
  const flow = calculationFlow(page);
  await expect(flow.locator('[data-calculation-node="step"]')).toHaveCount(2);
  await expect.poll(async () => Math.round((await page.getByRole("dialog").boundingBox())?.x ?? -1)).toBe(0);
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(390);
  for (const node of await flow.locator("[data-calculation-node]").all()) {
    const box = await node.boundingBox();
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(390);
  }
  await calculationChip(page, "operation").first().click();
  const option = page.getByRole("option", { name: "Divide", exact: true });
  await expect(option).toBeVisible();
  const sheet = await option.boundingBox();
  expect(sheet?.width ?? 0).toBeGreaterThan(300);
  await page.keyboard.press("Escape");
  await expect(option).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("reads each step as one line and inserts steps from the connectors", async ({ page, companyId }, testInfo) => {
  const errors = captureErrors(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await openConfigure(page, presetId(companyId, "deal"));
  await openConfigureRow(page, "Fields", "Weighted value");
  await openDrawerTab(page, "Calculation");
  const flow = calculationFlow(page);
  const steps = flow.locator('[data-calculation-node="step"]');
  const line = (index: number) => steps.nth(index).locator("[data-calculation-line] [data-calculation-chip]");
  await expect(steps).toHaveCount(2);
  await expect(flow.locator("[data-calculation-insert-step]")).toHaveCount(3);
  await expect(flow.getByRole("button", { name: "Add input", exact: true })).toHaveCount(1);
  await expect(steps.getByRole("button", { name: "Add step", exact: true })).toHaveCount(0);
  await expect(line(0)).toHaveText(["Value", "×", /probability/i]);
  await expect(line(1)).toHaveText(["Step 1", "÷", "100"]);
  await expect(line(0).nth(1)).toHaveAttribute("aria-label", "Calculation: Multiply");
  const boxes = await steps
    .nth(1)
    .locator("[data-calculation-line]")
    .evaluate((element) =>
      [...element.querySelectorAll("[data-calculation-chip]")].map((chip) => chip.getBoundingClientRect().toJSON()),
    );
  for (const [index, box] of boxes.entries()) {
    expect(Math.abs(box.y - boxes[0].y)).toBeLessThanOrEqual(2);
    if (index > 0) expect(box.x).toBeGreaterThan(boxes[index - 1].x);
  }

  const extend = steps.nth(0).locator("[data-calculation-extend-step]");
  const coarse = await page.evaluate(() => window.matchMedia("(any-pointer: coarse)").matches);
  if (!coarse) {
    await page.mouse.move(0, 0);
    await expect(extend).toHaveCSS("opacity", "0");
    await steps.nth(0).hover();
  }
  await expect(extend).toHaveCSS("opacity", "1");
  await expect(extend).toHaveAccessibleName("Add to Step 1");

  await steps.nth(0).scrollIntoViewIfNeeded();
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.mouse.move(0, 0);
    await page.screenshot({ path: testInfo.outputPath(`calculation-flow-desktop-${scheme}.png`), animations: "disabled" });
  }
  await page.emulateMedia({ colorScheme: "light" });

  await flow.locator('[data-calculation-insert-step="1"]').click();
  await expect(steps).toHaveCount(3);
  await expect(line(0)).toHaveText(["Value", "×", /probability/i]);
  await expect(line(1)).toHaveText(["Step 1", "+", "Pick a value"]);
  await expect(line(2)).toHaveText(["Step 2", "÷", "100"]);
  await expect(flow.locator("[data-calculation-insert-step]")).toHaveCount(4);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(async () => Math.round((await page.getByRole("dialog").boundingBox())?.x ?? -1)).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await steps.nth(1).scrollIntoViewIfNeeded();
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.screenshot({ path: testInfo.outputPath(`calculation-flow-phone-${scheme}.png`), animations: "disabled" });
  }
  await page.emulateMedia({ colorScheme: "light" });

  const menu = steps.nth(1).getByRole("button", { name: "More actions for Step 2", exact: true });
  await menu.focus();
  await page.keyboard.press("Enter");
  await page.getByRole("menuitem", { name: "Remove step", exact: true }).click();
  await expect(steps).toHaveCount(2);
  await expect(line(1)).toHaveText(["Step 1", "÷", "100"]);

  const inputs = flow.locator("[data-calculation-inputs]");
  await expect(inputs.locator("[data-calculation-input]")).toHaveCount(3);
  const removeHundred = inputs.getByRole("button", { name: "Remove 100", exact: true });
  if (!coarse) {
    await page.mouse.move(0, 0);
    await expect(removeHundred).toHaveCSS("opacity", "0");
    await inputs.locator("[data-calculation-input]").filter({ hasText: "100" }).hover();
  }
  await expect(removeHundred).toHaveCSS("opacity", "1");
  await removeHundred.click();
  await expect(steps).toHaveCount(1);
  await expect(line(0)).toHaveText(["Value", "×", /probability/i]);
  await expect(inputs.locator("[data-calculation-input]")).toHaveCount(2);
  expect(errors).toEqual([]);
});

/**
 * With a busy server the previous Configure page can still be mounted while the next one renders. Wait until exactly
 * one Configure page and list pane remain, so the checks below read the current page.
 */
async function expectSingleConfigurePage(page: Page, typeId: string) {
  await expect(page).toHaveURL(new RegExp(`[?&]typeId=${typeId}`));
  await expect(page.locator("[data-configure-page]")).toHaveCount(1);
  await expect(page.locator("[data-configure-list-pane]")).toHaveCount(1);
  await expect(page.locator("[data-configure-list-pane]")).toBeVisible();
}

async function expectAligned(node: Locator) {
  const offset = await node.evaluate((element) => {
    const icon = element.querySelector("svg")?.getBoundingClientRect();
    const first = element.querySelector("[data-calculation-row] > div > *")?.getBoundingClientRect();
    return icon && first ? Math.abs(icon.left - first.left) : Number.POSITIVE_INFINITY;
  });
  expect(offset).toBeLessThanOrEqual(1);
}

test("lines up formula, lookup and rollup flows the same way", async ({ page, companyId }, testInfo) => {
  const errors = captureErrors(page);
  page.on("dialog", (dialog) => void dialog.accept());
  const flows: Array<{ name: string; list: string; field?: string; node: string }> = [
    { name: "formula", list: "deal", field: "Weighted value", node: "inputs" },
    { name: "lookup", list: "lineItem", field: "Saved unit price", node: "linked" },
    { name: "rollup", list: "deal", field: "Value", node: "linked" },
    { name: "rollup-empty", list: "deal", node: "pick-relationship" },
  ];
  for (const width of [1280, 390]) {
    for (const example of flows) {
      await page.setViewportSize({ width, height: width > 400 ? 900 : 844 });
      await page.goto("about:blank");
      const typeId = presetId(companyId, example.list);
      await page.goto(`/en/configure?typeId=${typeId}`);
      await expectSingleConfigurePage(page, typeId);
      if (example.field) {
        await openConfigureRow(page, "Fields", example.field);
        await expectSingleConfigurePage(page, typeId);
        await openDrawerTab(page, "Calculation");
      } else {
        await addFromConfigure(page, "Calculated field");
        await expectSingleConfigurePage(page, typeId);
        await chooseValueSource(page, "Counted or totalled from linked records");
      }
      const flow = calculationFlow(page);
      const node = flow.locator(`[data-calculation-node="${example.node}"]`).first();
      await expect(node).toBeVisible();
      await expectAligned(node);
      await node.scrollIntoViewIfNeeded();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      for (const scheme of ["light", "dark"] as const) {
        await page.emulateMedia({ colorScheme: scheme });
        await page.mouse.move(0, 0);
        await page.screenshot({
          path: testInfo.outputPath(`${example.name}-${width > 400 ? "desktop" : "phone"}-${scheme}.png`),
          animations: "disabled",
        });
      }
      await page.emulateMedia({ colorScheme: "light" });
    }
  }
  expect(errors).toEqual([]);
});

test("hides the composer and keeps the flow unchanged when drafting isn't available", async ({ page, companyId }) => {
  const errors = captureErrors(page);
  const dialog = page.getByRole("dialog");
  await openConfigure(page, presetId(companyId, "deal"));
  await openConfigureRow(page, "Fields", "Weighted value");
  await openDrawerTab(page, "Calculation");
  const flow = calculationFlow(page);
  const sentence = await flow.locator("[data-calculation-sentence]").textContent();
  const composer = dialog.getByRole("textbox", { name: "Describe the calculation", exact: true });
  await expect(composer).toBeVisible();
  await composer.fill("Weighted value is the value times the stage probability");
  await composer.press("Enter");
  await expect(dialog.getByText("Drafting isn't available right now.", { exact: true })).toBeVisible();
  await expect(composer).toHaveCount(0);
  await expect(flow.locator("[data-calculation-sentence]")).toHaveText(sentence ?? "");
  await expect(dialog.getByRole("button", { name: "Save", exact: true }).first()).toBeDisabled();
  expect(errors).toEqual([]);
});
