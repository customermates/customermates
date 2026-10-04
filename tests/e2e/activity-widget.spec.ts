import { test, expect, isAppConsoleError, isBenignPageError } from "./fixtures";

test("creates a custom-type activity widget, previews history, edits it and preserves assistant drafts", async ({
  page,
  database,
  companyId,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    if (!isBenignPageError(error.message)) errors.push(error.message);
  });
  page.on("console", (message) => {
    if (
      isAppConsoleError(message) ||
      message.text().includes("changing from uncontrolled") ||
      message.text().includes("changing from controlled")
    )
      errors.push(message.text());
  });
  const dialog = page.getByRole("dialog");
  await page.goto("/en/company/data-model");
  await page.getByRole("button", { name: "Create list", exact: true }).click();
  await dialog.getByRole("textbox", { name: "Name", exact: false }).first().fill("Tenders");
  await dialog.getByRole("button", { name: "Create list", exact: true }).click();
  await expect(page).toHaveURL(/\/en\/records\/[a-f0-9-]+$/);
  await expect(dialog).not.toBeVisible();
  const typeId = new URL(page.url()).pathname.split("/").at(-1);
  await page.locator("#records-add").click();
  await dialog.getByRole("textbox", { name: "Tenders", exact: false }).fill("Harbour renewal");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.goto("/en/dashboard");
  await page.locator("#dashboard-add-widget").click();
  await dialog.locator("#widget-kind-activityTimeline").click();
  await dialog.getByRole("textbox", { name: "Name", exact: false }).fill("Tender activity");
  await dialog.getByRole("combobox", { name: "Record types", exact: true }).click();
  await page.locator('[data-slot="popover-content"]').getByRole("combobox").fill("Tenders");
  await page.getByRole("option", { name: "Tenders", exact: true }).click();
  await page.keyboard.press("Escape");
  await dialog.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(dialog.getByText("Harbour renewal", { exact: true })).toBeVisible();
  await dialog.locator("#widget-modal-save").click();
  await expect(dialog).not.toBeVisible();
  const card = page
    .locator('[data-uid="app-card"]')
    .filter({ has: page.getByRole("heading", { name: "Tender activity", exact: true }) });
  await expect(card.getByText("Harbour renewal", { exact: true })).toBeVisible();
  const saved = await database.query(
    'SELECT id,version,"activityQuery" FROM "Widget" WHERE "companyId"=$1 AND name=$2',
    [companyId, "Tender activity"],
  );
  expect(saved.rows).toHaveLength(1);
  expect(saved.rows[0].activityQuery.scope).toEqual({ typeIds: [typeId], records: [] });
  expect(saved.rows[0].version).toBe(1);
  await page.reload();
  await expect(card.getByText("Harbour renewal", { exact: true })).toBeVisible();
  await card.getByRole("button", { name: "Filters, 1 active", exact: true }).click();
  await dialog.getByRole("textbox", { name: "Name", exact: false }).fill("Tender history");
  await dialog.getByRole("button", { name: "Ask AI", exact: true }).click();
  await expect(page.getByTestId("agent-composer-contexts").getByText("Tender history", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("textbox", { name: "Name", exact: false })).toHaveValue("Tender history");
  await page.getByTestId("agent-panel").getByRole("button", { name: "Close", exact: true }).click();
  await dialog.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const updated = await database.query(
    'SELECT name,version,"activityQuery" FROM "Widget" WHERE "companyId"=$1 AND id=$2',
    [companyId, saved.rows[0].id],
  );
  expect(updated.rows[0]).toMatchObject({
    name: "Tender history",
    version: 2,
    activityQuery: saved.rows[0].activityQuery,
  });
  const messages = await database.query('SELECT COUNT(*)::integer AS count FROM "AgentMessage" WHERE "companyId"=$1', [
    companyId,
  ]);
  expect(messages.rows).toEqual([{ count: 0 }]);
  await page.screenshot({
    path: testInfo.outputPath("custom-activity-widget.png"),
    fullPage: true,
    animations: "disabled",
  });
  expect(errors).toEqual([]);
});
