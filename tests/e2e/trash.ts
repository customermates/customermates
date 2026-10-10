import { expect, type Page } from "@playwright/test";

import { CONFIGURATION_TRASH_HREF, TRASH_HREF } from "@/features/trash/trash-routes";
import { runNamedRowAction } from "./record-rows";

export async function openTrash(page: Page, { configuration = false } = {}) {
  await page.goto(`/en${configuration ? CONFIGURATION_TRASH_HREF : TRASH_HREF}`);
  await expect(page.getByRole("main")).toBeVisible();
}

export const trashRow = (page: Page, label: string) =>
  page.getByRole("row").filter({ has: page.getByText(label, { exact: true }) });

export async function restoreFromTrash(page: Page, label: string) {
  await openTrash(page, { configuration: true });
  await expect(trashRow(page, label)).toBeVisible();
  await runNamedRowAction(page, trashRow(page, label), label, "Restore");
  await expect(page.getByText(/^(1 item restored|Restored)/).first()).toBeVisible();
  await expect(trashRow(page, label)).toHaveCount(0);
}

export async function deleteFromTrashPermanently(page: Page, label: string) {
  await openTrash(page, { configuration: true });
  await expect(trashRow(page, label)).toBeVisible();
  await runNamedRowAction(page, trashRow(page, label), label, "Delete permanently");
  const confirmation = page.getByRole("alertdialog");
  await expect(confirmation).toBeVisible();
  const typed = confirmation.getByRole("textbox");
  if (await typed.count()) await typed.fill(label);
  await confirmation.getByRole("button", { name: "Delete permanently", exact: true }).click();
  await expect(confirmation).not.toBeVisible();
  await expect(page.getByText("Deleted permanently", { exact: true }).first()).toBeVisible();
  await expect(trashRow(page, label)).toHaveCount(0);
}
