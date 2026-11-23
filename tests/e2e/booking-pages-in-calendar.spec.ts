import { randomUUID } from "node:crypto";

import type { Page } from "@playwright/test";
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
const live = booking.upcomingCount.replace("{count}", "0");

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
  const dialog = page.getByRole("dialog").filter({ hasNot: page.locator("[data-booking-panel]") });
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

async function createBookingPage(page: Page, title: string) {
  await page.goto(pagePath(page, "/calendar?panel=booking"));
  const panel = page.locator("[data-booking-panel]");
  await expect(panel).toBeVisible();
  await panel.getByRole("button", { name: booking.new, exact: true }).first().click();
  const dialog = page.getByRole("dialog").filter({ hasNot: page.locator("[data-booking-panel]") });
  await dialog.locator("#title").fill(title);
  await dialog.locator("#booking-link-modal-save").click();
  await expect(dialog).toHaveCount(0);
  const row = panel.locator("[data-booking-link]");
  await expect(row).toHaveCount(1);
  const url = await row.locator("[data-value]").getAttribute("data-value");
  if (!url) throw new Error("The booking page has no public address.");
  return { panel, row, url };
}

test("keeps a booking page whose calendar is gone, shows it as unavailable and lets its owner choose a calendar", async ({
  page,
  database,
  workspace,
}) => {
  test.setTimeout(120000);
  const errors = collectPageErrors(page);
  const lostCalendarId = await connectCalendar(database, workspace);
  await page.setViewportSize({ width: 1280, height: 900 });

  const { row, url } = await createBookingPage(page, "Intro call");
  await expect(row.locator("[data-booking-calendar-missing]")).toHaveCount(0);
  await expect(row.locator("[data-booking-status]")).toHaveText(live);

  // The calendar disappears at the provider; the account keeps another calendar.
  const account = await database.query<{ connectedAccountId: string }>(
    'SELECT "connectedAccountId" FROM "Calendar" WHERE id=$1',
    [lostCalendarId],
  );
  const otherCalendarId = randomUUID();
  await database.query(
    'INSERT INTO "Calendar"(id,"companyId","connectedAccountId","unipileCalendarId",name,"updatedAt") VALUES($1,$2,$3,$4,\'Second calendar\',now())',
    [otherCalendarId, workspace.companyId, account.rows[0].connectedAccountId, `e2e_local_${otherCalendarId}`],
  );
  await database.query('DELETE FROM "Calendar" WHERE id=$1', [lostCalendarId]);
  const storedCalendar = async () =>
    (
      await database.query<{ calendarId: string | null }>(
        'SELECT "calendarId" FROM "BookingLink" WHERE "companyId"=$1',
        [workspace.companyId],
      )
    ).rows.map((link) => link.calendarId);
  expect(await storedCalendar()).toEqual([null]);

  await page.goto(pagePath(page, "/calendar?panel=booking"));
  const orphan = page.locator("[data-booking-panel] [data-booking-link]");
  await expect(orphan).toHaveCount(1);
  await expect(orphan.getByRole("heading", { name: "Intro call" })).toBeVisible();
  await expect(orphan.locator("[data-booking-calendar-missing]")).toContainText(booking.noCalendar);
  await expect(orphan.locator("[data-booking-status]")).toHaveText(booking.panelUnavailable);
  await expect(orphan.locator("[data-value]")).toHaveAttribute("data-value", url);

  // A visitor sees the page as unavailable until a calendar is chosen.
  const visitor = await page.context().newPage();
  await visitor.goto(url);
  await expect(visitor.getByText(englishMessages.PublicBooking.unavailable, { exact: true })).toBeVisible();
  await expect(visitor.locator("[data-booking-calendar]")).toHaveCount(0);

  await orphan.getByRole("button", { name: booking.chooseCalendar, exact: true }).click();
  const dialog = page.getByRole("dialog").filter({ hasNot: page.locator("[data-booking-panel]") });
  await expect(dialog.locator("#title")).toHaveValue("Intro call");
  await dialog.locator("#calendarId").click();
  await page.getByRole("option").filter({ hasText: "Second calendar" }).click();
  await dialog.locator("#booking-link-modal-save").click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: booking.saved }).last()).toBeVisible();

  await expect(orphan.locator("[data-booking-calendar-missing]")).toHaveCount(0);
  await expect(orphan.locator("[data-booking-status]")).toHaveText(live);
  await expect.poll(storedCalendar).toEqual([otherCalendarId]);

  await visitor.reload();
  await expect(visitor.locator("#public-booking-title")).toHaveText("Intro call");
  await expect(visitor.locator("[data-booking-calendar]")).toBeVisible();
  await visitor.close();

  expect(errors).toEqual([]);
});

test("lets a visitor move to a later month and pick a time there", async ({ page, database, workspace }) => {
  test.setTimeout(120000);
  const errors = collectPageErrors(page);
  await connectCalendar(database, workspace);
  await page.setViewportSize({ width: 1280, height: 900 });

  const { url } = await createBookingPage(page, "Intro call");
  await database.query('UPDATE "BookingLink" SET "horizonDays"=90 WHERE "companyId"=$1', [workspace.companyId]);

  const visitor = await page.context().newPage();
  const visitorErrors = collectPageErrors(visitor);
  await visitor.goto(url);
  const calendar = visitor.locator("[data-booking-calendar]");
  await expect(calendar).toBeVisible();
  await expect(visitor.locator("[data-booking-slots] button").first()).toBeVisible();

  // The page opens on the month of the first free day.
  const firstDay = await calendar.locator('button[data-day][data-selected-single="true"]').getAttribute("data-day");
  if (!firstDay) throw new Error("The booking page did not select its first free day.");
  const [year, month] = firstDay.split("-").map(Number);
  const laterMonth = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, "0")}`;
  const caption = await calendar.locator(".rdp-month_caption").innerText();

  // The month it opens on is loaded to its end: its last working day can be picked without leaving the month.
  const lastWorkingDay = new Date(Date.UTC(year, month, 0));
  while ([0, 6].includes(lastWorkingDay.getUTCDay())) lastWorkingDay.setUTCDate(lastWorkingDay.getUTCDate() - 1);
  await expect(calendar).toHaveAttribute("aria-busy", "false");
  await expect(calendar.locator(`button[data-day="${lastWorkingDay.toISOString().slice(0, 10)}"]`)).toBeEnabled();

  await calendar.locator("button.rdp-button_next").click();
  await expect(calendar.locator(".rdp-month_caption")).not.toHaveText(caption);
  await expect(calendar).toHaveAttribute("aria-busy", "false");

  // The times of the later month load when the visitor gets there: its last free day lies behind the first page.
  const laterDay = calendar
    .locator(`button[data-day^="${laterMonth}-"]:not([disabled]):not([aria-disabled="true"])`)
    .last();
  await expect(laterDay).toBeVisible();
  const laterDate = await laterDay.getAttribute("data-day");
  await laterDay.click();
  await expect(calendar.locator(`button[data-day="${laterDate}"]`)).toHaveAttribute("data-selected-single", "true");
  await expect(visitor.locator("#booking-name")).toHaveCount(0);

  const slot = visitor.locator("[data-booking-slots] button").first();
  await expect(slot).toBeVisible();
  await slot.click();
  await expect(visitor.locator("[data-booking-form] #booking-name")).toBeEnabled();
  await expect(visitor.locator("[data-booking-form] #booking-email")).toBeEnabled();

  // Back returns to the times of the month the visitor was on; the earlier month and its first free day stay available.
  await visitor.locator("[data-booking-back]").click();
  await expect(calendar.locator(`button[data-day="${laterDate}"]`)).toHaveAttribute("data-selected-single", "true");
  await calendar.locator("button.rdp-button_previous").click();
  await expect(calendar.locator(".rdp-month_caption")).toHaveText(caption);
  await expect(calendar.locator(`button[data-day="${firstDay}"]`)).toBeEnabled();
  await visitor.close();

  expect(visitorErrors).toEqual([]);
  expect(errors).toEqual([]);
});

test("offers no times and tells the owner when the calendar cannot be read in full", async ({
  page,
  database,
  workspace,
}) => {
  test.setTimeout(120000);
  const errors = collectPageErrors(page);
  const calendarId = await connectCalendar(database, workspace);
  await page.setViewportSize({ width: 1280, height: 900 });

  const { url } = await createBookingPage(page, "Intro call");
  await expect(page.locator("[data-booking-panel] [data-booking-busy-incomplete]")).toHaveCount(0);

  // A repeating entry that cannot be worked out: the page must not treat the calendar as free.
  await database.query(
    'INSERT INTO "CalendarEvent"(id,"companyId","connectedAccountId","calendarId","unipileEventId",title,"startsAt","endsAt","recurrenceRule","attendeeEmails","updatedAt") SELECT $1,c."companyId",c."connectedAccountId",c.id,$2,\'Every second\',now() - interval \'1 day\',now() - interval \'1 day\' + interval \'1 minute\',\'RRULE:FREQ=SECONDLY\',\'{}\',now() FROM "Calendar" c WHERE c.id=$3',
    [randomUUID(), `e2e_local_${randomUUID()}`, calendarId],
  );

  const visitor = await page.context().newPage();
  const visitorErrors = collectPageErrors(visitor);
  await visitor.goto(url);
  await expect(visitor.getByText(englishMessages.PublicBooking.noSlots, { exact: true })).toBeVisible();
  await expect(visitor.locator("[data-booking-slots] button")).toHaveCount(0);
  await visitor.close();

  await page.goto(pagePath(page, "/calendar?panel=booking"));
  await expect(page.locator("[data-booking-panel] [data-booking-busy-incomplete]")).toContainText(
    booking.busyTimeIncomplete,
  );

  expect(visitorErrors).toEqual([]);
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
