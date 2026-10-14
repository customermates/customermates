import { expect, type Locator, type Page } from "@playwright/test";

import { itemMenuLabels, openItemMenu, runItemAction } from "./item-actions";

export function recordItem(page: Page, name: string) {
  return page
    .locator("tr, [data-row-id], [data-item-id]")
    .filter({ has: page.getByRole("link", { name, exact: true }) })
    .first();
}

function moreActions(item: Locator, name: string) {
  return item.getByRole("button", { name: `More actions for ${name}`, exact: true });
}

export async function openRecordDetails(page: Page, name: string) {
  await page.waitForLoadState("networkidle");
  await runRowAction(page, recordItem(page, name), name, "Open details");
}

export async function rowActionLabels(page: Page, item: Locator, name: string) {
  return itemMenuLabels(page, await openItemMenu(page, moreActions(item, name)));
}

export async function runRowAction(page: Page, item: Locator, name: string, label: string) {
  await runItemAction(page, moreActions(item, name), label);
}

export function rowActionFocusTarget(item: Locator, name: string) {
  return moreActions(item, name);
}

export async function runNamedRowAction(page: Page, scope: Locator, name: string, label: string) {
  const trigger = scope.getByRole("button", { name: `More actions for ${name}`, exact: true });
  await expect(trigger).toBeAttached();
  await runItemAction(page, trigger, label);
}

export async function editFormattedText(scope: Locator | Page, label: string) {
  const page = "page" in scope ? scope.page() : scope;
  await scope
    .locator("[data-formatted-text-field]")
    .filter({ has: page.getByRole("button", { name: `Edit ${label}`, exact: true }) })
    .locator("[data-formatted-text-area]")
    .click();
}

export function recordRows(scope: Locator | Page) {
  return scope.locator("tbody tr, [data-phone-rows] [data-row-id]");
}

export async function recordRowName(row: Locator) {
  const open = row.locator('[data-slot="data-row-open"]');
  if (await open.count()) return (await open.first().innerText()).trim();
  return (await row.locator(":scope > a[aria-label], :scope > button[aria-label]").first().getAttribute("aria-label")) ?? "";
}

export async function openRecordLink(target: Locator) {
  await target.click({ position: { x: 8, y: 8 } });
}
