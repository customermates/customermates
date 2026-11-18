import { randomUUID } from "node:crypto";

import type { Client } from "pg";

import { collectPageErrors, expect, test } from "./fixtures";
import { addAdministrator, clickHydrated, e2eAppMode } from "./workspace-switching";

test.skip(
  e2eAppMode() === "self-hosted",
  "Booking pages use the hosted calendar connection and exist on Customermates Cloud only",
);

const EVERY_DAY = Object.fromEntries(
  ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map((day) => [
    day,
    [{ start: "08:00", end: "18:00" }],
  ]),
);

async function connectCalendar(database: Client, owner: { companyId: string; userId: string }, email: string) {
  const accountId = randomUUID();
  const calendarId = randomUUID();
  await database.query(
    'INSERT INTO "ConnectedAccount"(id,"companyId","userId","unipileAccountId",provider,status,"hasMessaging","hasCalendar","emailAddress","displayName","updatedAt") VALUES($1,$2,$3,$4,\'google\',\'ok\',true,true,$5,$5,now())',
    [accountId, owner.companyId, owner.userId, `e2e_local_${accountId}`, email],
  );
  await database.query(
    'INSERT INTO "Calendar"(id,"companyId","connectedAccountId","unipileCalendarId",name,"updatedAt") VALUES($1,$2,$3,$4,\'Work\',now())',
    [calendarId, owner.companyId, accountId, `e2e_local_${calendarId}`],
  );
  return calendarId;
}

async function addBookingPage(
  database: Client,
  owner: { companyId: string; userId: string },
  calendarId: string,
  options: { title: string; assignment?: "single" | "roundRobin" } = { title: "Intro call" },
) {
  const id = randomUUID();
  const token = `e2e${randomUUID().replace(/-/gu, "")}`;
  await database.query(
    'INSERT INTO "BookingLink"(id,"companyId","userId","calendarId",token,title,"durationMinutes","minNoticeMinutes","horizonDays","timeZone","workingHours",assignment,"updatedAt") VALUES($1,$2,$3,$4,$5,$6,30,60,30,\'UTC\',$7,$8::"BookingAssignment",now())',
    [
      id,
      owner.companyId,
      owner.userId,
      calendarId,
      token,
      options.title,
      JSON.stringify(EVERY_DAY),
      options.assignment ?? "single",
    ],
  );
  return { id, token };
}

async function bookingOf(database: Client, bookingLinkId: string) {
  const result = await database.query<{
    id: string;
    status: string;
    hostUserId: string;
    startsAt: Date;
    cancelledBy: string | null;
    cancelReason: string | null;
    rescheduledAt: Date | null;
    calendarEventId: string | null;
  }>(
    'SELECT id,status,"hostUserId","startsAt","cancelledBy","cancelReason","rescheduledAt","calendarEventId" FROM "Booking" WHERE "bookingLinkId"=$1 ORDER BY "createdAt" DESC LIMIT 1',
    [bookingLinkId],
  );
  return result.rows[0];
}

test("a visitor books a time, moves it and cancels it through the private link", async ({
  page,
  database,
  workspace,
}) => {
  test.setTimeout(120000);
  const errors = collectPageErrors(page);
  const calendarId = await connectCalendar(database, workspace, "owner@synthetic.test");
  const link = await addBookingPage(database, workspace, calendarId);

  await page.goto(`/en/book/${link.token}`);
  await expect(page.locator("#public-booking-title")).toHaveText("Intro call");
  const firstTime = page.locator("[data-booking-slots] button").first();
  await clickHydrated(firstTime);
  await expect(page.locator("[data-booking-when]")).toBeVisible();
  await page.locator("#booking-name").fill("Vera Visitor");
  await page.locator("#booking-email").fill("vera.visitor@synthetic.test");
  await page.getByRole("button", { name: "Confirm booking", exact: true }).click();

  const confirmed = page.locator("[data-booking-confirmed]");
  await expect(confirmed).toContainText("You are booked");
  await expect(confirmed).toContainText("Intro call");
  const booked = await bookingOf(database, link.id);
  expect(booked).toMatchObject({ status: "confirmed", hostUserId: workspace.userId, cancelledBy: null });
  expect(booked.calendarEventId).not.toBeNull();
  const event = await database.query<{ description: string | null; status: string }>(
    'SELECT description,status FROM "CalendarEvent" WHERE id=$1',
    [booked.calendarEventId],
  );
  expect(event.rows[0].description).toMatch(/Cancel or reschedule: http.*\/book\/manage\/[A-Za-z0-9_-]{16,}/u);

  await confirmed.locator("[data-booking-manage-link]").click();
  await expect(page).toHaveURL(/\/book\/manage\/[A-Za-z0-9_-]{16,}$/u);
  await expect(page.locator('[data-booking-manage="upcoming"]')).toContainText("Intro call");

  await clickHydrated(page.locator("[data-booking-reschedule]"));
  const otherTime = page.locator("[data-booking-slots] button").nth(2);
  await otherTime.click();
  await page.locator("[data-booking-reschedule-confirm]").click();
  await expect(page.locator('[data-booking-manage="upcoming"]')).toContainText("The booking is moved");
  const moved = await bookingOf(database, link.id);
  expect(moved.status).toBe("confirmed");
  expect(moved.rescheduledAt).not.toBeNull();
  expect(moved.startsAt.getTime()).not.toBe(booked.startsAt.getTime());
  const movedEvent = await database.query<{ startsAt: Date }>('SELECT "startsAt" FROM "CalendarEvent" WHERE id=$1', [
    booked.calendarEventId,
  ]);
  expect(movedEvent.rows[0].startsAt.getTime()).toBe(moved.startsAt.getTime());

  await page.locator("[data-booking-cancel]").click();
  await page.locator("#booking-cancel-reason").fill("Something came up");
  await page.locator("[data-booking-cancel-confirm]").click();
  await expect(page.locator('[data-booking-manage="cancelled"]')).toContainText("The booking is cancelled");
  const cancelled = await bookingOf(database, link.id);
  expect(cancelled).toMatchObject({ status: "cancelled", cancelledBy: "invitee", cancelReason: "Something came up" });
  const cancelledEvent = await database.query<{ status: string }>('SELECT status FROM "CalendarEvent" WHERE id=$1', [
    booked.calendarEventId,
  ]);
  expect(cancelledEvent.rows[0].status).toBe("cancelled");

  const notices = await database.query<{ title: string }>(
    'SELECT title FROM "Notification" WHERE "companyId"=$1 AND "userId"=$2 ORDER BY "createdAt"',
    [workspace.companyId, workspace.userId],
  );
  expect(notices.rows.map((row) => row.title)).toEqual([
    "Vera Visitor booked a meeting",
    "Vera Visitor moved a meeting",
    "Vera Visitor cancelled a meeting",
  ]);

  await page.reload();
  await expect(page.locator('[data-booking-manage="cancelled"]')).toContainText("This booking was cancelled.");
  await expect(page.locator("[data-booking-cancel]")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("a round robin page books the free host with the fewest upcoming bookings", async ({
  page,
  database,
  workspace,
}) => {
  test.setTimeout(120000);
  const errors = collectPageErrors(page);
  const ownerCalendar = await connectCalendar(database, workspace, "owner@synthetic.test");
  const colleagueId = await addAdministrator(database, workspace.companyId, `clara-${randomUUID()}@synthetic.test`);
  const colleagueCalendar = await connectCalendar(
    database,
    { companyId: workspace.companyId, userId: colleagueId },
    "clara@synthetic.test",
  );
  const link = await addBookingPage(database, workspace, ownerCalendar, {
    title: "Team demo",
    assignment: "roundRobin",
  });
  await database.query(
    'INSERT INTO "BookingLinkHost"("bookingLinkId","companyId","userId","calendarId",position) VALUES($1,$2,$3,$4,0)',
    [link.id, workspace.companyId, colleagueId, colleagueCalendar],
  );
  const later = new Date(Date.now() + 20 * 86_400_000);
  await database.query(
    'INSERT INTO "Booking"(id,"companyId","bookingLinkId","hostUserId","manageToken",status,"inviteeName","inviteeEmail","startsAt","endsAt","timeZone","updatedAt") VALUES($1,$2,$3,$4,$5,\'confirmed\',\'Earlier Guest\',\'earlier@synthetic.test\',$6,$7,\'UTC\',now())',
    [
      randomUUID(),
      workspace.companyId,
      link.id,
      workspace.userId,
      `e2e${randomUUID().replace(/-/gu, "")}`,
      later,
      new Date(later.getTime() + 30 * 60_000),
    ],
  );

  await page.goto(`/en/book/${link.token}`);
  await expect(page.locator("#public-booking-title")).toHaveText("Team demo");
  await clickHydrated(page.locator("[data-booking-slots] button").first());
  await page.locator("#booking-name").fill("Rob Round");
  await page.locator("#booking-email").fill("rob.round@synthetic.test");
  await page.getByRole("button", { name: "Confirm booking", exact: true }).click();

  await expect(page.locator("[data-booking-confirmed]")).toContainText("With Clara Admin");
  const booked = await bookingOf(database, link.id);
  expect(booked).toMatchObject({ status: "confirmed", hostUserId: colleagueId });
  expect(errors).toEqual([]);
});
