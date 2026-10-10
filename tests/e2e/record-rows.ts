import { expect, type Locator, type Page } from "@playwright/test";

export function recordItem(page: Page, name: string) {
  return page
    .locator("tr, [data-item-id]")
    .filter({ has: page.getByRole("link", { name, exact: true }) })
    .first();
}

export async function openRecordDetails(page: Page, name: string) {
  const item = recordItem(page, name);
  const inline = item.getByRole("button", { name: "Open details", exact: true });
  const openDetails = page.getByRole("menuitem", { name: "Open details", exact: true });
  await page.waitForLoadState("networkidle");
  await expect(async () => {
    await item.hover();
    if (await inline.isVisible()) return;
    if (!(await openDetails.isVisible()))
      await item.getByRole("button", { name: `More actions for ${name}`, exact: true }).click();
    await expect(openDetails).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 20000 });
  if (await inline.isVisible()) await inline.click();
  else await openDetails.click();
}

export function rowActionGroup(item: Locator) {
  return item.locator("[data-row-action-group]");
}

export async function rowActionLabels(page: Page, item: Locator, name: string) {
  await item.hover();
  const group = rowActionGroup(item);
  if (await group.isVisible())
    return group.getByRole("button").evaluateAll((buttons) => buttons.map((button) => button.getAttribute("aria-label")));
  await item.getByRole("button", { name: `More actions for ${name}`, exact: true }).click();
  const labels = await page.getByRole("menuitem").allInnerTexts();
  await page.keyboard.press("Escape");
  return labels.map((label) => label.trim());
}

export async function runRowAction(page: Page, item: Locator, name: string, label: string) {
  await item.hover();
  const group = rowActionGroup(item);
  if (await group.isVisible()) {
    await group.getByRole("button", { name: label, exact: true }).click();
    return;
  }
  await item.getByRole("button", { name: `More actions for ${name}`, exact: true }).click();
  await page.getByRole("menuitem", { name: label, exact: true }).click();
}

export function rowActionFocusTarget(item: Locator, name: string) {
  return item
    .locator(`[data-row-action-group] button[aria-label="Open details"], button[aria-label="More actions for ${name}"]`)
    .filter({ visible: true });
}

export async function runNamedRowAction(page: Page, scope: Locator, name: string, label: string) {
  const group = scope.getByRole("group", { name, exact: true }).and(scope.locator("[data-row-action-group]"));
  const menu = scope.getByRole("button", { name: `More actions for ${name}`, exact: true });
  await expect(group.or(menu).first()).toBeAttached();
  if (await group.isVisible()) {
    await group.getByRole("button", { name: label, exact: true }).click();
    return;
  }
  await menu.click();
  await page.getByRole("menuitem", { name: label, exact: true }).click();
}
