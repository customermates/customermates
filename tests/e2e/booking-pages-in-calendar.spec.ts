import { randomUUID } from "node:crypto";

import type { Client } from "pg";

import englishMessages from "../../i18n/locales/en.json" with { type: "json" };
import { pagePath } from "./app-paths";
import { collectPageErrors, expect, test } from "./fixtures";
import { e2eAppMode } from "./workspace-switching";

test.skip(
  e2eAppMode() === "self-hosted",
  "Booking pages use the hosted calendar connection and exist on Customermates Cloud only",
);

const booking = englishMessages.Booking;

async function connectCalendar(database: Client, owner: { companyId: string; userId: string }) {
  const accountId = randomUUID();
  const calendarId = randomUUID();
  await database.query(
    'INSERT INTO "ConnectedAccount"(id,"companyId","userId","unipileAccountId",provider,status,"hasMessaging","hasCalendar","emailAddress","displayName","updatedAt") VALUES($1,$2,$3,$4,\'google\',\'ok\',true,true,\'owner@synthetic.test\',\'owner@synthetic.test\',now())',
    [accountId, owner.companyId, owner.userId, `e2e_local_${accountId}`],
  );
  await database.query(
    'INSERT INTO "Calendar"(id,"companyId","connectedAccountId","unipileCalendarId",name,"updatedAt") VALUES($1,$2,$3,$4,\'Work\',now())',
    [calendarId, owner.companyId, accountId, `e2e_local_${calendarId}`],
  );
  return calendarId;
}

test("creates a booking page from the calendar, sees the preview follow the title and finds its link in the panel", async ({
  page,
  database,
  workspace,
}) => {
  test.setTimeout(120000);
  const errors = collectPageErrors(page);
  await connectCalendar(database, workspace);
  await page.setViewportSize({ width: 1280, height: 900 });

  await page.goto(pagePath(page, "/calendar"));
  await expect(page.locator("[data-planner-page]")).toBeVisible();
  await expect(page.locator("[data-booking-panel]")).toHaveCount(0);
  await page.getByRole("button", { name: booking.panelTitle, exact: true }).click();
  const panel = page.locator("[data-booking-panel]");
  await expect(panel).toBeVisible();
  await expect(panel.getByText(booking.empty, { exact: true })).toBeVisible();

  await panel.getByRole("button", { name: booking.new, exact: true }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator("[data-booking-layout]")).toHaveAttribute("data-booking-layout", "wide");
  const preview = dialog.locator("[data-booking-preview-pane]");
  await expect(preview).toBeVisible();
  await expect(preview.locator("#public-booking-title")).toHaveText(booking.pagePreviewTitle);

  await dialog.locator("#title").fill("Intro call");
  await expect(preview.locator("#public-booking-title")).toHaveText("Intro call");
  await expect(preview.locator("[data-booking-slots] button").first()).toBeVisible();
  await preview.locator("[data-booking-slots] button").first().click();
  await expect(preview.locator("#booking-name")).toBeDisabled();
  await expect(preview.locator("#booking-email")).toBeDisabled();

  await dialog.locator("#booking-link-modal-save").click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator("[data-sonner-toast]")).toContainText(booking.saved);

  const row = panel.locator("[data-booking-link]");
  await expect(row).toHaveCount(1);
  await expect(row.getByRole("heading", { name: "Intro call" })).toBeVisible();
  await expect(row.locator("[data-value]")).toHaveAttribute("data-value", /\/book\/[A-Za-z0-9_-]{16,}$/u);
  await expect(row.getByRole("switch")).toBeChecked();

  const stored = await database.query<{ title: string; enabled: boolean; userId: string }>(
    'SELECT title,enabled,"userId" FROM "BookingLink" WHERE "companyId"=$1',
    [workspace.companyId],
  );
  expect(stored.rows).toEqual([{ title: "Intro call", enabled: true, userId: workspace.userId }]);

  await row.getByRole("switch").click();
  await expect(row.getByRole("switch")).not.toBeChecked();
  await expect(row).toContainText(booking.paused);
  await expect
    .poll(
      async () =>
        (
          await database.query<{ enabled: boolean }>('SELECT enabled FROM "BookingLink" WHERE "companyId"=$1', [
            workspace.companyId,
          ])
        ).rows[0]?.enabled,
    )
    .toBe(false);

  await page.reload();
  await expect(page.locator("[data-booking-panel]")).toHaveCount(0);
  await page.goto(pagePath(page, "/calendar?panel=booking"));
  await expect(page.locator("[data-booking-panel] [data-booking-link]")).toHaveCount(1);

  expect(errors).toEqual([]);
});

test("sends the retired booking settings route to the booking panel of the calendar", async ({
  page,
  database,
  workspace,
}) => {
  const errors = collectPageErrors(page);
  await connectCalendar(database, workspace);

  await page.goto(pagePath(page, "/settings/booking"));

  await expect(page).toHaveURL(/\/calendar\?panel=booking$/u);
  await expect(page.locator("[data-booking-panel]")).toBeVisible();
  await expect(page.locator("[data-planner-page]")).toBeVisible();

  const settingsNavigation = page.locator('a[href$="/settings/booking"]');
  await expect(settingsNavigation).toHaveCount(0);
  expect(errors).toEqual([]);
});
