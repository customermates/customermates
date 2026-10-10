import type { Page } from "@playwright/test";

import englishMessages from "../../i18n/locales/en.json" with { type: "json" };
import { test, expect, isAppConsoleError, isBenignPageError } from "./fixtures";
import { runNamedRowAction } from "./record-rows";

function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    if (!isBenignPageError(error.message)) errors.push(error.message);
  });
  page.on("console", (message) => {
    if (isAppConsoleError(message)) errors.push(message.text());
  });
  return errors;
}

test("moves a routine to Trash, stops listing it and restores it from Trash", async ({
  page,
  database,
  companyId,
  workspace,
}) => {
  const errors = collectErrors(page);
  await database.query(
    `INSERT INTO "Routine" (id, "companyId", "ownerUserId", name, prompt, enabled, "triggerKind", "cronExpression", timezone, "updatedAt")
     VALUES (gen_random_uuid(), $1, $2, 'Weekly digest', 'Summarize', false, 'schedule', '0 9 * * 1', 'Europe/Berlin', NOW())`,
    [companyId, workspace.userId],
  );
  await page.goto("/en/routines");
  const row = page.getByRole("row").filter({ hasText: "Weekly digest" });
  const confirmation = page.getByRole("alertdialog");
  await expect(async () => {
    await runNamedRowAction(page, row, "Weekly digest", englishMessages.Common.actions.delete);
    await expect(confirmation).toBeVisible({ timeout: 3000 });
  }).toPass({ timeout: 30000 });
  await confirmation.getByRole("button", { name: englishMessages.Common.actions.delete, exact: true }).click();
  await expect(row).toHaveCount(0);
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: englishMessages.Trash.movedToTrash })).toBeVisible();

  await page.goto("/en/trash");
  const trashed = page.getByRole("row").filter({ hasText: "Weekly digest" });
  await expect(trashed).toContainText(englishMessages.Trash.kinds.routine);
  await runNamedRowAction(page, trashed, "Weekly digest", englishMessages.Trash.restore);
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: "1 item restored" })).toBeVisible();
  await expect(trashed).toHaveCount(0);

  await page.goto("/en/routines");
  await expect(page.getByRole("row").filter({ hasText: "Weekly digest" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("undoes a Knowledge Base page delete from the toast", async ({ page, database, companyId }) => {
  const errors = collectErrors(page);
  const created = await database.query(
    `INSERT INTO "WikiPage" (id, "companyId", title, markdown, "updatedAt") VALUES (gen_random_uuid(), $1, 'Refund policy', 'Refunds take five days.', NOW()) RETURNING id`,
    [companyId],
  );
  const pageId = created.rows[0].id as string;
  await page.goto(`/en/wiki?page=${pageId}`);
  await expect(page.getByText("Refunds take five days.").first()).toBeVisible();
  await page.getByRole("button", { name: englishMessages.Wiki.pageActions, exact: true }).click();
  await page.getByRole("menuitem", { name: englishMessages.Wiki.delete, exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: englishMessages.Common.actions.delete, exact: true }).click();
  const toast = page.locator("[data-sonner-toast]").filter({ hasText: englishMessages.Trash.movedToTrash });
  await expect(toast).toBeVisible();
  await expect
    .poll(async () => (await database.query('SELECT "deletedAt" FROM "WikiPage" WHERE id=$1', [pageId])).rows[0].deletedAt)
    .not.toBeNull();
  await toast.getByRole("button", { name: englishMessages.Trash.undo, exact: true }).click();
  await expect
    .poll(async () => (await database.query('SELECT "deletedAt" FROM "WikiPage" WHERE id=$1', [pageId])).rows[0].deletedAt)
    .toBeNull();
  await expect(page.getByText("Refunds take five days.").first()).toBeVisible();
  expect(errors).toEqual([]);
});
