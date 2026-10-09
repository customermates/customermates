import { expect, type Page } from "@playwright/test";

import { CONFIGURATION_TRASH_HREF, TRASH_HREF } from "@/features/trash/trash-routes";

export async function openTrash(page: Page, { configuration = false } = {}) {
  await page.goto(`/en${configuration ? CONFIGURATION_TRASH_HREF : TRASH_HREF}`);
  await expect(page.getByRole("main")).toBeVisible();
}

export const trashRow = (page: Page, label: string) =>
  page.getByRole("row").filter({ has: page.getByText(label, { exact: true }) });

async function openRowMenu(page: Page, label: string) {
  const row = trashRow(page, label);
  await expect(async () => {
    await row.hover();
    await row.getByRole("button", { name: `More actions for ${label}`, exact: true }).click();
    await expect(page.getByRole("menu")).toBeVisible({ timeout: 1000 });
  }).toPass();
}

export async function restoreFromTrash(page: Page, label: string) {
  await openTrash(page, { configuration: true });
  await openRowMenu(page, label);
  await page.getByRole("menuitem", { name: "Restore", exact: true }).click();
  await expect(trashRow(page, label)).toHaveCount(0);
}

export async function deleteFromTrashPermanently(page: Page, label: string) {
  await openTrash(page, { configuration: true });
  await openRowMenu(page, label);
  await page.getByRole("menuitem", { name: "Delete permanently", exact: true }).click();
  const confirmation = page.getByRole("alertdialog");
  await expect(confirmation).toBeVisible();
  const typed = confirmation.getByRole("textbox");
  if (await typed.count()) await typed.fill(label);
  await confirmation.getByRole("button", { name: "Delete permanently", exact: true }).click();
  await expect(confirmation).not.toBeVisible();
  await expect(trashRow(page, label)).toHaveCount(0);
}
