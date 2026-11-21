import { randomUUID } from "node:crypto";

import { companyPath } from "./app-paths";
import { collectPageErrors, expect, test } from "./fixtures";
import { e2eAppMode } from "./workspace-switching";

test("Settings explains a Google account with an operational calendar and unavailable Gmail", async ({
  page,
  database,
  workspace,
}, testInfo) => {
  test.skip(e2eAppMode() !== "cloud", "Connected channels are a cloud feature");
  const errors = collectPageErrors(page);
  await database.query('UPDATE "Subscription" SET plan=\'pro\' WHERE "companyId"=$1', [workspace.companyId]);
  await database.query(
    'INSERT INTO "ConnectedAccount" (id,"companyId","userId","unipileAccountId",provider,status,"hasMessaging","hasCalendar","displayName","connectionDetails","statusCheckedAt","updatedAt") VALUES ($1,$2,$3,$4,\'google\',\'ok\',false,true,\'Calendar only\',$5,NOW(),NOW())',
    [
      randomUUID(),
      workspace.companyId,
      workspace.userId,
      randomUUID(),
      JSON.stringify({
        status: "partial",
        products: { gmail: "disconnected", calendar: "running" },
        reason: "Mailbox unavailable",
      }),
    ],
  );

  await page.goto(companyPath(workspace.companyId, "/settings/connections"));
  // The row names what the account can do; the state of each product is in its details.
  const row = page.locator("#connections-inbox [data-connected-account]", { hasText: "Calendar only" });
  await expect(row).toHaveAttribute("data-status", "ok");
  await expect(row.getByText("Calendar", { exact: true })).toBeVisible();
  await expect(row.getByText("Email", { exact: true })).toHaveCount(0);
  await expect(row.getByText("Reconnect needed", { exact: true })).toHaveCount(0);
  await row.getByRole("button", { name: /Calendar only/ }).first().click();
  const dialog = page.getByRole("dialog", { name: "Calendar only", exact: true });
  await expect(dialog.getByText("Connected", { exact: true })).toHaveCount(3);
  await expect(dialog.getByText("Not available", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Reconnect needed", { exact: true })).toHaveCount(0);
  await expect(dialog.getByText("Mailbox unavailable", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Status checked", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Email", { exact: true })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Resync", exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("google-calendar-status.png"), animations: "disabled" });
  expect(errors).toEqual([]);
});
