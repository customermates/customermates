import type { Locator, Page } from "@playwright/test";

import { expect } from "./fixtures";

type Scope = Page | Locator;

export async function saveViewChanges(page: Page) {
  const modified = page.locator("#global-data-views [data-view-modified]");
  await expect(modified).toHaveCount(1);
  await page.locator("#global-data-views-menu").click();
  await page.locator("#global-data-views-save").click();
  await expect(modified).toHaveCount(0);
}

export async function submitViewEditor(page: Page, name?: string, scope: Scope = page): Promise<string> {
  const input = page.locator("#view-editor-name");
  await expect(input).toBeVisible();
  if (name) await input.fill(name);
  else await expect(input).not.toHaveValue("");
  const submitted = await input.inputValue();
  await page.locator('button[form="view-editor-form"]').click();
  await expect(input).toHaveCount(0);
  await expect(scope.locator("#global-data-views").getByRole("link", { name: submitted, exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
  return submitted;
}
