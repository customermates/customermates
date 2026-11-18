import { randomUUID } from "node:crypto";
import { deflateSync } from "node:zlib";

import type { Page } from "@playwright/test";
import type { Client } from "pg";

import { appPath } from "./app-paths";
import { collectPageErrors, expect, test } from "./fixtures";
import { addAdministrator, clickHydrated, e2eAppMode, expectHydrated } from "./workspace-switching";

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

// A booking sent sooner than two seconds after the page was rendered counts as automated and is refused.
async function confirmLikeAPerson(page: Page) {
  await page.waitForTimeout(2200);
  await page.getByRole("button", { name: "Confirm booking", exact: true }).click();
}

// Booking limits count per visitor address; each journey books as its own visitor.
async function asOwnVisitor(page: Page) {
  const octet = () => 1 + Math.floor(Math.random() * 250);
  await page.setExtraHTTPHeaders({ "x-real-ip": `10.${octet()}.${octet()}.${octet()}` });
}

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
  await asOwnVisitor(page);
  const calendarId = await connectCalendar(database, workspace, "owner@synthetic.test");
  const link = await addBookingPage(database, workspace, calendarId);

  await page.goto(`/en/book/${link.token}`);
  await expect(page.locator("#public-booking-title")).toHaveText("Intro call");
  const firstTime = page.locator("[data-booking-slots] button").first();
  await clickHydrated(firstTime);
  await expect(page.locator("[data-booking-when]")).toBeVisible();
  await page.locator("#booking-name").fill("Vera Visitor");
  await page.locator("#booking-email").fill("vera.visitor@synthetic.test");
  await confirmLikeAPerson(page);

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

const uint32 = (value: number) => [value >>> 24, (value >>> 16) & 255, (value >>> 8) & 255, value & 255];

function crc32(bytes: number[]) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: number[]) {
  const body = [...Buffer.from(type, "latin1"), ...data];
  return [...uint32(data.length), ...body, ...uint32(crc32(body))];
}

// A square PNG of one colour, small enough to read in a failure report and real enough for a browser to decode.
function solidPng(size: number, rgb: [number, number, number]) {
  const row = [0, ...Array.from({ length: size }, () => rgb).flat()];
  const pixels = Array.from({ length: size }, () => row).flat();
  return Buffer.from([
    ...[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    ...pngChunk("IHDR", [...uint32(size), ...uint32(size), 8, 2, 0, 0, 0]),
    ...pngChunk("IDAT", [...deflateSync(Buffer.from(pixels))]),
    ...pngChunk("IEND", []),
  ]);
}

test("a logo and an accent colour set under Branding show on the workspace's booking page", async ({
  page,
  database,
  workspace,
}) => {
  test.setTimeout(120000);
  const errors = collectPageErrors(page);
  await asOwnVisitor(page);
  const calendarId = await connectCalendar(database, workspace, "owner@synthetic.test");
  const link = await addBookingPage(database, workspace, calendarId, { title: "Branded call" });
  const brandOf = async () =>
    (
      await database.query<{ accentColor: string | null; logoType: string | null; logoKey: string | null }>(
        'SELECT "accentColor","logoType","logoKey" FROM "CompanyBrand" WHERE "companyId"=$1',
        [workspace.companyId],
      )
    ).rows[0];

  await page.goto(appPath(workspace.slug, "/settings/general"));
  const branding = page.locator("#settings-general-branding");
  await expect(branding).toContainText("Branding");
  await expect(branding.locator("#settings-general-branding-logo-preview")).toContainText("No logo");
  await expectHydrated(branding.locator("#settings-general-branding-logo-upload"));

  await branding
    .locator("#settings-general-branding-logo-input")
    .setInputFiles({ name: "logo.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg></svg>") });
  await expect(branding.locator("#settings-general-branding-logo-error")).toHaveText(
    "Choose a PNG, JPEG or WebP image.",
  );
  expect(await brandOf()).toBeUndefined();

  await branding
    .locator("#settings-general-branding-logo-input")
    .setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: solidPng(24, [15, 98, 254]) });
  const settingsLogo = branding.locator("#settings-general-branding-logo-preview img[data-brand-logo]");
  await expect(settingsLogo).toBeVisible();
  await expect(branding.locator("#settings-general-branding-logo-error")).toHaveCount(0);

  const unsavedChanges = page.locator("[data-slot='unsaved-changes-bar']");
  await branding.locator("#settings-general-branding-accent").fill("#0F62FE");
  await expect(branding.locator("#settings-general-branding-accent-reset")).toBeVisible();
  await page.locator("#settings-general-save").click();
  await expect(unsavedChanges).toHaveCount(0);
  await expect(branding.locator("#settings-general-branding-accent")).toHaveValue("#0f62fe");
  const stored = await brandOf();
  expect(stored).toMatchObject({ accentColor: "#0f62fe", logoType: "image/png" });

  await page.goto(`/en/book/${link.token}`);
  await expect(page.locator("#public-booking-title")).toHaveText("Branded call");
  await expect(page.locator("#public-booking")).toHaveAttribute("data-brand-accent", "#0f62fe");
  const logo = page.locator("#public-booking aside img[data-brand-logo]");
  await expect(logo).toHaveAttribute("src", `/api/brand/logo/${stored.logoKey}`);
  await expect(logo).toHaveAttribute("alt", "Browser workspace");
  await expect
    .poll(() => logo.evaluate((image: HTMLImageElement) => (image.complete ? image.naturalWidth : 0)))
    .toBe(24);
  const served = await page.request.get(`/api/brand/logo/${stored.logoKey}`);
  expect(served.status()).toBe(200);
  expect(served.headers()["content-type"]).toBe("image/png");
  expect(served.headers()["cache-control"]).toBe("public, max-age=31536000, immutable");
  expect(served.headers()["x-content-type-options"]).toBe("nosniff");
  expect((await page.request.get("/api/brand/logo/unknown_key_abcdefghijklmnopqrstu")).status()).toBe(404);

  await clickHydrated(page.locator("[data-booking-slots] button").first());
  const confirm = page.getByRole("button", { name: "Confirm booking", exact: true });
  await expect(confirm).toHaveCSS("background-color", "rgb(15, 98, 254)");
  await expect(confirm).toHaveCSS("color", "rgb(255, 255, 255)");
  await page.locator("#booking-name").fill("Bea Brand");
  await page.locator("#booking-email").fill("bea.brand@synthetic.test");
  await confirmLikeAPerson(page);

  const confirmed = page.locator("[data-booking-confirmed]");
  await expect(confirmed).toContainText("You are booked");
  await expect(confirmed.locator("img[data-brand-logo]")).toBeVisible();
  await confirmed.locator("[data-booking-manage-link]").click();
  await expect(page.locator('[data-booking-manage="upcoming"] img[data-brand-logo]')).toBeVisible();
  await expect(page.locator("#public-booking")).toHaveAttribute("data-brand-accent", "#0f62fe");
  await expect(page.locator("[data-booking-reschedule]")).toHaveCSS("background-color", "rgb(15, 98, 254)");

  await page.goto(appPath(workspace.slug, "/settings/general"));
  await clickHydrated(branding.locator("#settings-general-branding-logo-remove"));
  await expect(branding.locator("#settings-general-branding-logo-preview")).toContainText("No logo");
  await branding.locator("#settings-general-branding-accent-reset").click();
  await expect(branding.locator("#settings-general-branding-accent")).toHaveValue("");
  await page.locator("#settings-general-save").click();
  await expect(unsavedChanges).toHaveCount(0);
  expect(await brandOf()).toMatchObject({ accentColor: null, logoType: null, logoKey: null });

  await page.goto(`/en/book/${link.token}`);
  await expect(page.locator("#public-booking-title")).toHaveText("Branded call");
  await expect(page.locator("#public-booking img[data-brand-logo]")).toHaveCount(0);
  expect(await page.locator("#public-booking").getAttribute("data-brand-accent")).toBeNull();
  expect(errors).toEqual([]);
});

test("a round robin page books the free host with the fewest upcoming bookings", async ({
  page,
  database,
  workspace,
}) => {
  test.setTimeout(120000);
  const errors = collectPageErrors(page);
  await asOwnVisitor(page);
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
  await confirmLikeAPerson(page);

  await expect(page.locator("[data-booking-confirmed]")).toContainText("With Clara Admin");
  const booked = await bookingOf(database, link.id);
  expect(booked).toMatchObject({ status: "confirmed", hostUserId: colleagueId });
  expect(errors).toEqual([]);
});
