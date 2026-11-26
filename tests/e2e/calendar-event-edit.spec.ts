import type { Client } from "pg";
import type { Locator, Page, TestInfo } from "@playwright/test";

import { randomUUID } from "node:crypto";

import { e2eAppMode } from "./workspace-switching";
import { appPath } from "./app-paths";
import { DEMO_COMPANY_ID, DEMO_MEMBERS, DEMO_SLUG, expect, test } from "./demo-seed";
import { localE2eEnvironment } from "./local-environment";
import { readLocalCalendarWrites, seedLocalCalendarEvent } from "./local-calendar-provider.mjs";

const P13N_ID = "combined-calendar";
const HOUR_HEIGHT = 48;
const OWNER_EMAIL = "max@example.com";
const GUEST_EMAIL = "sam@example.com";
const USER_ID = DEMO_MEMBERS.maxBergmann.userId;

type CalendarWrite = { accountId: string; eventId: string; method: string; body?: Record<string, unknown> };
type Seed = {
  title: string;
  startsAt: string;
  endsAt: string;
  allDay?: boolean;
  guests?: boolean;
  master?: string;
  recurrence?: string;
  stored?: boolean;
};

test.describe.configure({ mode: "serial" });

function settled(page: Page) {
  return page.evaluate(() => Promise.all(document.getAnimations().map((animation) => animation.finished)));
}

function eventId() {
  return `e2e_event_${randomUUID()}`;
}

function shiftDate(date: string, days: number) {
  return new Date(Date.parse(`${date}T00:00:00.000Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

function writesFor(accountId: string): CalendarWrite[] {
  return (readLocalCalendarWrites(localE2eEnvironment().providerDirectory) as CalendarWrite[]).filter(
    (write) => write.accountId === accountId,
  );
}

async function dragBy(page: Page, handle: Locator, dx: number, dy: number) {
  const box = await handle.boundingBox();
  if (!box) throw new Error("The calendar entry must be visible");
  const x = box.x + box.width / 2;
  const y = box.y + Math.min(box.height / 2, 12);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + Math.sign(dx) * 6, y + Math.sign(dy) * 6, { steps: 3 });
  await page.mouse.move(x + dx, y + dy, { steps: 12 });
  await page.mouse.up();
}

class ConnectedCalendar {
  readonly accountRowId = randomUUID();
  readonly calendarRowId = randomUUID();
  readonly accountId = `e2e_local_${this.accountRowId}`;
  readonly calendarId = `e2e_local_${this.calendarRowId}`;
  private previousSettings: unknown = null;

  constructor(private readonly database: Client) {}

  async connect() {
    const previous = await this.database.query(
      'SELECT settings FROM "P13n" WHERE "companyId"=$1 AND "userId"=$2 AND "p13nId"=$3',
      [DEMO_COMPANY_ID, USER_ID, P13N_ID],
    );
    this.previousSettings = previous.rowCount ? previous.rows[0].settings : null;
    await this.database.query(
      'INSERT INTO "ConnectedAccount"(id,"companyId","userId","unipileAccountId",provider,status,"hasMessaging","hasCalendar","emailAddress","displayName","updatedAt") VALUES($1,$2,$3,$4,\'google\',\'ok\',true,true,$5,$5,now())',
      [this.accountRowId, DEMO_COMPANY_ID, USER_ID, this.accountId, OWNER_EMAIL],
    );
    await this.database.query(
      'INSERT INTO "Calendar"(id,"companyId","connectedAccountId","unipileCalendarId",name,"updatedAt") VALUES($1,$2,$3,$4,\'Editable meetings\',now())',
      [this.calendarRowId, DEMO_COMPANY_ID, this.accountRowId, this.calendarId],
    );
    await this.database.query('DELETE FROM "P13n" WHERE "companyId"=$1 AND "userId"=$2 AND "p13nId"=$3', [
      DEMO_COMPANY_ID,
      USER_ID,
      P13N_ID,
    ]);
    await this.database.query(
      'INSERT INTO "P13n" (id,"companyId","userId","p13nId",settings,"updatedAt","columnOrder","hiddenColumns") VALUES ($4,$1,$2,$3,$5,NOW(),ARRAY[]::text[],ARRAY[]::text[])',
      [
        DEMO_COMPANY_ID,
        USER_ID,
        P13N_ID,
        randomUUID(),
        JSON.stringify({ sources: [], calendarIds: [this.calendarRowId], timeZone: "Europe/Berlin", mode: "week" }),
      ],
    );
  }

  async seed(unipileEventId: string, seed: Seed): Promise<string> {
    const attendees = [
      { email: OWNER_EMAIL, displayName: "Max Bergmann", responseStatus: "accepted", isOrganizer: true },
      ...(seed.guests
        ? [{ email: GUEST_EMAIL, displayName: "Sam Whitcombe", responseStatus: "accepted", isOrganizer: false }]
        : []),
    ];
    const time = (value: string) =>
      seed.allDay
        ? { type: "date", date: value.slice(0, 10) }
        : { type: "datetime", date_time: value, timezone: "Europe/Berlin" };
    seedLocalCalendarEvent(localE2eEnvironment().providerDirectory, this.accountId, this.calendarId, {
      object: "CalendarEvent",
      id: unipileEventId,
      calendar_id: this.calendarId,
      title: seed.title,
      is_cancelled: false,
      is_all_day: Boolean(seed.allDay),
      start: time(seed.startsAt),
      end: time(seed.endsAt),
      attendees: attendees.map((attendee) => ({
        email: attendee.email,
        display_name: attendee.displayName,
        response_status: "yes",
        is_organizer: attendee.isOrganizer,
      })),
      organizer: { email: OWNER_EMAIL, display_name: "Max Bergmann" },
      transparency: "opaque",
      ...(seed.master ? { master_event_id: seed.master } : {}),
      ...(seed.recurrence ? { recurrence: [seed.recurrence] } : {}),
    });
    if (seed.stored === false) return "";
    const id = randomUUID();
    await this.database.query(
      `INSERT INTO "CalendarEvent" (id,"companyId","connectedAccountId","calendarId","unipileEventId","masterUnipileEventId",title,"startsAt","endsAt","allDay",timezone,"recurrenceRule",attendees,"attendeeEmails","updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::timestamptz,$9::timestamptz,$10,'Europe/Berlin',$11,$12::jsonb,$13,NOW())`,
      [
        id,
        DEMO_COMPANY_ID,
        this.accountRowId,
        this.calendarRowId,
        unipileEventId,
        seed.master ?? null,
        seed.title,
        seed.startsAt,
        seed.endsAt,
        Boolean(seed.allDay),
        seed.recurrence ?? null,
        JSON.stringify(attendees),
        attendees.map((attendee) => attendee.email),
      ],
    );
    return id;
  }

  async row(id: string) {
    const result = await this.database.query(
      'SELECT title, status, "startsAt", "endsAt" FROM "CalendarEvent" WHERE id=$1 AND "companyId"=$2',
      [id, DEMO_COMPANY_ID],
    );
    return result.rows[0] as { title: string; status: string; startsAt: Date; endsAt: Date };
  }

  async disconnect() {
    await this.database.query('DELETE FROM "ConnectedAccount" WHERE id=$1 AND "companyId"=$2', [
      this.accountRowId,
      DEMO_COMPANY_ID,
    ]);
    await this.database.query('DELETE FROM "P13n" WHERE "companyId"=$1 AND "userId"=$2 AND "p13nId"=$3', [
      DEMO_COMPANY_ID,
      USER_ID,
      P13N_ID,
    ]);
    if (this.previousSettings !== null)
      await this.database.query(
        'INSERT INTO "P13n" (id,"companyId","userId","p13nId",settings,"updatedAt","columnOrder","hiddenColumns") VALUES ($4,$1,$2,$3,$5,NOW(),ARRAY[]::text[],ARRAY[]::text[])',
        [DEMO_COMPANY_ID, USER_ID, P13N_ID, randomUUID(), this.previousSettings],
      );
  }
}

function skipOutsideDesktopCloud(testInfo: TestInfo) {
  test.skip(e2eAppMode() !== "cloud", "Connected calendars are written only in the hosted app.");
  test.skip(testInfo.project.name === "mobile", "The week view with hours is a desktop layout.");
  test.setTimeout(180000);
}

async function openPlanner(page: Page, mode?: "Month") {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(appPath(DEMO_SLUG, "/calendar"));
  await expect(page.locator("[data-planner-week-schedule]")).toBeVisible();
  if (mode) await page.getByRole("tab", { name: mode, exact: true }).click();
}

const today = () => new Date().toISOString().slice(0, 10);

test("a meeting opens for editing and is cancelled from the header action after a confirmation", async ({
  page,
  database,
  errors,
}, testInfo) => {
  skipOutsideDesktopCloud(testInfo);
  const calendar = new ConnectedCalendar(database);
  const unipileEventId = eventId();
  try {
    await calendar.connect();
    const id = await calendar.seed(unipileEventId, {
      title: "Onboarding call with Whitcombe",
      startsAt: `${today()}T13:00:00Z`,
      endsAt: `${today()}T13:45:00Z`,
      guests: true,
    });
    await openPlanner(page);
    const meeting = page.locator(`[data-planner-schedule-entry="event:${id}"]`);
    await meeting.scrollIntoViewIfNeeded();
    await meeting.click();

    const editor = page.getByRole("dialog", { name: "Edit meeting" });
    await expect(editor.getByRole("textbox", { name: /^Title/u })).toHaveValue("Onboarding call with Whitcombe");
    await expect(editor.getByText(GUEST_EMAIL)).toBeVisible();
    await expect(editor.getByRole("switch", { name: "Send the changes to the attendees" })).toBeVisible();
    await expect(editor.locator("[data-meeting-scope]")).toHaveCount(0);
    await expect(editor.locator("form").getByRole("button", { name: "Cancel meeting", exact: true })).toHaveCount(0);
    const headerCancel = editor.locator("#schedule-meeting-cancel");
    await expect(headerCancel).toHaveAccessibleName("Cancel meeting");
    await page.screenshot({ path: testInfo.outputPath("1-edit-meeting-header-action.png") });

    await headerCancel.click();
    const confirm = page.getByRole("alertdialog", { name: "Cancel this meeting?" });
    await expect(confirm).toBeVisible();
    await settled(page);
    await page.screenshot({ path: testInfo.outputPath("2-cancel-confirmation.png") });
    await confirm.getByRole("button", { name: "Cancel meeting", exact: true }).click();
    await expect(page.getByText("Meeting cancelled")).toBeVisible();
    await expect(editor).toHaveCount(0);

    expect((await calendar.row(id)).status).toBe("cancelled");
    expect(writesFor(calendar.accountId)).toEqual([expect.objectContaining({ eventId: unipileEventId, method: "CANCEL" })]);
    expect(errors).toEqual([]);
  } finally {
    await calendar.disconnect();
  }
});

test("dragging a meeting with attendees asks whether to notify them, and one without attendees saves quietly", async ({
  page,
  database,
  errors,
}, testInfo) => {
  skipOutsideDesktopCloud(testInfo);
  const calendar = new ConnectedCalendar(database);
  const withGuests = eventId();
  const alone = eventId();
  try {
    await calendar.connect();
    const guestsId = await calendar.seed(withGuests, {
      title: "Pipeline review with Sam",
      startsAt: `${today()}T08:00:00Z`,
      endsAt: `${today()}T08:30:00Z`,
      guests: true,
    });
    const aloneId = await calendar.seed(alone, {
      title: "Focus block",
      startsAt: `${today()}T12:00:00Z`,
      endsAt: `${today()}T12:30:00Z`,
    });
    await openPlanner(page);
    const meeting = page.locator(`[data-planner-schedule-entry="event:${guestsId}"]`);
    await meeting.scrollIntoViewIfNeeded();

    await dragBy(page, meeting, 0, HOUR_HEIGHT);
    const ask = page.getByRole("alertdialog", { name: "Notify the attendees?" });
    await expect(ask).toBeVisible();
    await expect(ask.getByRole("button", { name: "Just move", exact: true })).toBeVisible();
    await settled(page);
    await page.screenshot({ path: testInfo.outputPath("1-notify-question.png") });
    await ask.getByRole("button", { name: "Notify attendees", exact: true }).click();
    await expect(page.getByText("Google sends the new time to the attendees.")).toBeVisible();
    await expect
      .poll(() => writesFor(calendar.accountId).at(-1))
      .toMatchObject({
        eventId: withGuests,
        method: "PATCH",
        body: { notify: "all", start: { date_time: `${today()}T09:00:00Z` }, end: { date_time: `${today()}T09:30:00Z` } },
      });
    await expect.poll(async () => (await calendar.row(guestsId)).startsAt.toISOString()).toBe(`${today()}T09:00:00.000Z`);
    await expect(page.getByText("Google sends the new time to the attendees.")).toHaveCount(0, { timeout: 15000 });

    await dragBy(page, meeting, 0, HOUR_HEIGHT);
    await page.getByRole("alertdialog", { name: "Notify the attendees?" }).getByRole("button", { name: "Just move" }).click();
    await expect(page.getByText("The attendees were not notified.")).toBeVisible();
    await expect
      .poll(() => writesFor(calendar.accountId).at(-1))
      .toMatchObject({ eventId: withGuests, body: { notify: "none", start: { date_time: `${today()}T10:00:00Z` } } });
    await page.screenshot({ path: testInfo.outputPath("2-moved-quietly-with-undo.png") });
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(page.getByText("Move undone")).toBeVisible();
    await expect
      .poll(() => writesFor(calendar.accountId).at(-1))
      .toMatchObject({ eventId: withGuests, body: { notify: "none", start: { date_time: `${today()}T09:00:00Z` } } });

    await dragBy(page, meeting, 0, HOUR_HEIGHT);
    const again = page.getByRole("alertdialog", { name: "Notify the attendees?" });
    await again.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(again).toHaveCount(0);
    const writesBefore = writesFor(calendar.accountId).length;

    const block = page.locator(`[data-planner-schedule-entry="event:${aloneId}"]`);
    await block.scrollIntoViewIfNeeded();
    await dragBy(page, block, 0, HOUR_HEIGHT);
    await expect
      .poll(() => writesFor(calendar.accountId).at(-1))
      .toMatchObject({ eventId: alone, body: { notify: "none", start: { date_time: `${today()}T13:00:00Z` } } });
    expect(writesFor(calendar.accountId)).toHaveLength(writesBefore + 1);
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    expect((await calendar.row(guestsId)).startsAt.toISOString()).toBe(`${today()}T09:00:00.000Z`);
    expect(errors).toEqual([]);
  } finally {
    await calendar.disconnect();
  }
});

test("an all-day event moves by whole days and opens with its days but no time", async ({
  page,
  database,
  errors,
}, testInfo) => {
  skipOutsideDesktopCloud(testInfo);
  const calendar = new ConnectedCalendar(database);
  const unipileEventId = eventId();
  const day = today();
  try {
    await calendar.connect();
    const id = await calendar.seed(unipileEventId, {
      title: "Trade fair",
      startsAt: `${day}T00:00:00Z`,
      endsAt: `${shiftDate(day, 1)}T00:00:00Z`,
      allDay: true,
    });
    await openPlanner(page, "Month");
    const entry = page.locator(`[data-calendar-entry="event:${id}"]`).first();
    await expect(entry).toBeVisible();
    const target = await page.locator(`[data-calendar-day="${shiftDate(day, 1)}"]`).first().boundingBox();
    const box = await entry.boundingBox();
    if (!target || !box) throw new Error("The entry and the next day must be visible");
    await dragBy(page, entry, target.x + target.width / 2 - (box.x + box.width / 2), target.y + 30 - (box.y + 12));
    await expect
      .poll(() => writesFor(calendar.accountId).at(-1))
      .toMatchObject({
        eventId: unipileEventId,
        body: {
          notify: "none",
          start: { type: "date", date: shiftDate(day, 1) },
          end: { type: "date", date: shiftDate(day, 2) },
        },
      });
    await expect
      .poll(async () => (await calendar.row(id)).startsAt.toISOString())
      .toBe(`${shiftDate(day, 1)}T00:00:00.000Z`);
    await page.screenshot({ path: testInfo.outputPath("1-all-day-moved.png") });

    await page.locator(`[data-calendar-entry="event:${id}"]`).first().click();
    const editor = page.getByRole("dialog", { name: "Edit meeting" });
    await expect(editor.getByText("First day", { exact: true })).toBeVisible();
    await expect(editor.getByText("Last day", { exact: true })).toBeVisible();
    await expect(editor.locator("[data-schedule-meeting-slots]")).toHaveCount(0);
    await expect(editor.getByLabel("Start", { exact: true })).toHaveCount(0);
    await settled(page);
    await page.screenshot({ path: testInfo.outputPath("2-all-day-editor.png") });
    expect(errors).toEqual([]);
  } finally {
    await calendar.disconnect();
  }
});

test("an occurrence of a repeating meeting changes alone or with the whole series, a series without occurrences stays read-only", async ({
  page,
  database,
  errors,
}, testInfo) => {
  skipOutsideDesktopCloud(testInfo);
  const calendar = new ConnectedCalendar(database);
  const master = eventId();
  const first = eventId();
  const second = eventId();
  const ruleOnly = eventId();
  const day = today();
  try {
    await calendar.connect();
    await calendar.seed(master, {
      title: "Weekly pipeline review",
      startsAt: `${shiftDate(day, -7)}T07:00:00Z`,
      endsAt: `${shiftDate(day, -7)}T07:30:00Z`,
      recurrence: "RRULE:FREQ=WEEKLY",
      stored: false,
    });
    const firstId = await calendar.seed(first, {
      title: "Weekly pipeline review",
      startsAt: `${day}T07:00:00Z`,
      endsAt: `${day}T07:30:00Z`,
      master,
    });
    const secondId = await calendar.seed(second, {
      title: "Weekly pipeline review",
      startsAt: `${shiftDate(day, 7)}T07:00:00Z`,
      endsAt: `${shiftDate(day, 7)}T07:30:00Z`,
      master,
    });
    const seriesId = await calendar.seed(ruleOnly, {
      title: "Monthly board sync",
      startsAt: `${day}T15:00:00Z`,
      endsAt: `${day}T15:30:00Z`,
      recurrence: "RRULE:FREQ=MONTHLY",
    });
    await openPlanner(page);
    const occurrence = page.locator(`[data-planner-schedule-entry="event:${firstId}"]`);
    await occurrence.scrollIntoViewIfNeeded();

    await occurrence.click();
    let editor = page.getByRole("dialog", { name: "Edit meeting" });
    const scope = editor.locator("[data-meeting-scope]");
    await expect(scope.getByRole("radio", { name: "This event" })).toBeChecked();
    await expect(scope.getByRole("radio", { name: "All events" })).not.toBeChecked();
    await expect(scope.getByText("This and following", { exact: false })).toHaveCount(0);
    await editor.getByRole("textbox", { name: /^Title/u }).fill("Pipeline review (customer visit)");
    await settled(page);
    await page.screenshot({ path: testInfo.outputPath("1-occurrence-scope.png") });
    await editor.locator("#schedule-meeting-modal-save").click();
    await expect(editor).toHaveCount(0);
    await expect
      .poll(() => writesFor(calendar.accountId).at(-1))
      .toMatchObject({ eventId: first, method: "PATCH", body: { title: "Pipeline review (customer visit)" } });
    expect((await calendar.row(firstId)).title).toBe("Pipeline review (customer visit)");
    expect((await calendar.row(secondId)).title).toBe("Weekly pipeline review");

    await occurrence.click();
    editor = page.getByRole("dialog", { name: "Edit meeting" });
    await editor.locator("[data-meeting-scope]").getByRole("radio", { name: "All events" }).click();
    await editor.getByRole("textbox", { name: /^Title/u }).fill("Weekly pipeline sync");
    await editor.locator("#schedule-meeting-modal-save").click();
    await expect(editor).toHaveCount(0);
    await expect
      .poll(() => writesFor(calendar.accountId).at(-1))
      .toMatchObject({ eventId: master, method: "PATCH", body: { title: "Weekly pipeline sync" } });
    await expect.poll(async () => (await calendar.row(secondId)).title).toBe("Weekly pipeline sync");
    expect((await calendar.row(firstId)).title).toBe("Weekly pipeline sync");

    await dragBy(page, occurrence, 0, HOUR_HEIGHT);
    const ask = page.getByRole("alertdialog", { name: "Move repeating event" });
    await ask.getByRole("radio", { name: "All events" }).click();
    await settled(page);
    await page.screenshot({ path: testInfo.outputPath("2-series-move-question.png") });
    await ask.getByRole("button", { name: "Move", exact: true }).click();
    await expect
      .poll(() => writesFor(calendar.accountId).at(-1))
      .toMatchObject({
        eventId: master,
        body: { start: { date_time: `${shiftDate(day, -7)}T08:00:00Z` }, end: { date_time: `${shiftDate(day, -7)}T08:30:00Z` } },
      });
    await expect
      .poll(async () => (await calendar.row(secondId)).startsAt.toISOString())
      .toBe(`${shiftDate(day, 7)}T08:00:00.000Z`);

    await page.locator(`[data-planner-schedule-entry^="event:${seriesId}:"]`).first().click();
    const detail = page.getByRole("dialog", { name: "Monthly board sync" });
    await expect(detail.getByText("synced as a series without its single occurrences", { exact: false })).toBeVisible();
    await settled(page);
    await page.screenshot({ path: testInfo.outputPath("3-series-read-only.png") });
    expect(errors).toEqual([]);
  } finally {
    await calendar.disconnect();
  }
});
