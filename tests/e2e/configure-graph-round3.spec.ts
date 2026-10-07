import type { Locator, Page } from "@playwright/test";
import type { Client } from "pg";
import { presetId } from "../../features/records/crm-preset";
import { configureTopBar, openConfigure, openConfigureRow, openDrawerTab } from "./configure";
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

async function savedLayout(database: Client, companyId: string) {
  const result = await database.query(
    `SELECT settings FROM "P13n" WHERE "companyId" = $1 AND "p13nId" = 'configure-graph'`,
    [companyId],
  );
  return (result.rows[0]?.settings ?? null) as { positions: Record<string, { x: number; y: number }> } | null;
}

function flowNode(page: Page, typeId: string) {
  return page.locator(`.react-flow__node[data-id="${typeId}"]`);
}

async function transformOf(node: Locator) {
  return node.evaluate((element) => (element as HTMLElement).style.transform);
}

test("moves graph lists, keeps the layout per person and resets it", async ({ page, database, companyId }, testInfo) => {
  const errors = captureErrors(page);
  const dealId = presetId(companyId, "deal");
  await openConfigure(page);
  const graph = page.locator("[data-configure-graph]");
  const deal = flowNode(page, dealId);
  const reset = graph.getByRole("button", { name: "Reset layout", exact: true });
  await expect(deal).toBeVisible();
  await expect(reset).toBeDisabled();
  await expect(graph.getByText(/drag from the dot/i).filter({ visible: true })).toHaveCount(0);
  const header = deal.getByRole("button", { name: "Deals", exact: true });
  await expect(header.locator("svg").first()).toBeVisible();
  await expect(deal.locator(".bg-primary\\/15")).toHaveCount(0);

  if (testInfo.project.name === "mobile") {
    await expect(deal).not.toHaveClass(/draggable/);
    await header.click();
    await expect(page).toHaveURL(new RegExp(`typeId=${dealId}`));
    expect(await savedLayout(database, companyId)).toBeNull();
    expect(errors).toEqual([]);
    return;
  }

  await expect(deal).toHaveClass(/draggable/);
  const original = await transformOf(deal);
  const box = await header.boundingBox();
  if (!box) throw new Error("The list header has no layout box");
  const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 8, from.y + 8, { steps: 4 });
  await page.mouse.move(from.x + 180, from.y + 140, { steps: 16 });
  await page.mouse.up();
  await expect.poll(() => transformOf(deal)).not.toBe(original);
  await expect(page).not.toHaveURL(/typeId=/);
  await expect.poll(async () => (await savedLayout(database, companyId))?.positions[dealId]).toBeTruthy();
  const moved = await transformOf(deal);
  await expect(reset).toBeEnabled();

  await header.click();
  await expect(page).toHaveURL(new RegExp(`typeId=${dealId}`));
  await page.goBack();
  await expect(deal).toBeVisible();
  await expect.poll(() => transformOf(deal)).toBe(moved);

  await page.reload();
  await expect(deal).toBeVisible();
  await expect.poll(() => transformOf(deal)).toBe(moved);
  await expect(reset).toBeEnabled();

  await header.click();
  await expect(page).toHaveURL(new RegExp(`typeId=${dealId}`));
  await page.goBack();
  await expect(deal).toBeVisible();

  await reset.click();
  await expect.poll(() => savedLayout(database, companyId)).toBeNull();
  await expect.poll(() => transformOf(deal)).toBe(original);
  await expect(reset).toBeDisabled();
  await header.click();
  await page.goBack();
  await expect(deal).toBeVisible();
  await expect.poll(() => transformOf(deal)).toBe(original);
  expect(errors).toEqual([]);
});

test("shows a live calculation path at the top of the Calculation tab", async ({ page, companyId }) => {
  const errors = captureErrors(page);
  await openConfigure(page, presetId(companyId, "deal"));
  await openConfigureRow(page, "Fields", "Value");
  await openDrawerTab(page, "Calculation");
  const dialog = page.getByRole("dialog");
  const path = dialog.getByRole("figure", { name: "How the value is calculated", exact: true });
  const steps = path.getByRole("list", { name: "Calculation path", exact: true }).getByRole("listitem");
  await expect(steps).toHaveText(["Deal", /^via Line items \(.+\)$/, "Line item · Amount", "Sum", "Value"]);
  await expect(path.locator("[data-calculation-sentence]")).toHaveText(
    "Value = the sum of Amount across linked Line items.",
  );
  await expect(steps.first().locator("svg")).toHaveCount(1);

  await dialog.getByRole("combobox", { name: "Aggregation", exact: true }).click();
  await page.getByRole("option", { name: "Average", exact: true }).click();
  await expect(steps.nth(3)).toHaveText("Average");
  await expect(path.locator("[data-calculation-sentence]")).toHaveText(
    "Value = the average of Amount across linked Line items.",
  );

  await dialog.getByRole("combobox", { name: "Relationship", exact: true }).click();
  const relationshipOption = page.getByRole("option", { name: "Line items", exact: true });
  await expect(relationshipOption.locator("span > svg").first()).toBeVisible();
  await page.keyboard.press("Escape");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Discard", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(errors).toEqual([]);
});

test("suggests the plural list name until it is edited", async ({ page }) => {
  const errors = captureErrors(page);
  await openConfigure(page);
  await configureTopBar(page).getByRole("button", { name: "Add", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("textbox", { name: "Navigation label" })).toHaveCount(0);
  await dialog.getByRole("textbox", { name: "Name", exact: false }).first().fill("Project");
  const plural = dialog.getByRole("textbox", { name: "Plural name", exact: true });
  await expect(plural).toHaveValue("Projects");
  await plural.fill("Portfolio");
  await dialog.getByRole("textbox", { name: "Name", exact: false }).first().fill("Programme");
  await expect(plural).toHaveValue("Portfolio");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Discard", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(errors).toEqual([]);
});
