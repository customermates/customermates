import type { Page } from "@playwright/test";

import { randomUUID } from "node:crypto";

import { e2eAppMode } from "./workspace-switching";
import { appPath } from "./app-paths";
import { DEMO_COMPANY_ID, DEMO_MEMBERS, DEMO_SLUG, expect, test } from "./demo-seed";

const P13N_ID = "combined-calendar";

function settled(page: Page) {
  return page.evaluate(() => Promise.all(document.getAnimations().map((animation) => animation.finished)));
}

test("a meeting in the viewer's own connected calendar opens for editing, a recurring one stays read-only", async ({
  page,
  database,
  errors,
}, testInfo) => {
  test.skip(e2eAppMode() !== "cloud", "Connected calendars are written only in the hosted app.");
  test.skip(testInfo.project.name === "mobile", "The week view with hours is a desktop layout.");
  test.setTimeout(180000);

  const userId = DEMO_MEMBERS.maxBergmann.userId;
  const meetingId = randomUUID();
  const seriesId = randomUUID();
  const day = new Date().toISOString().slice(0, 10);
  const previous = await database.query(
    'SELECT settings FROM "P13n" WHERE "companyId"=$1 AND "userId"=$2 AND "p13nId"=$3',
    [DEMO_COMPANY_ID, userId, P13N_ID],
  );
  try {
    const calendar = await database.query(
      `SELECT c.id FROM "Calendar" c JOIN "ConnectedAccount" a ON a.id=c."connectedAccountId"
       WHERE c."companyId"=$1 AND c.name='Customer meetings' AND a."userId"=$2 LIMIT 1`,
      [DEMO_COMPANY_ID, userId],
    );
    expect(calendar.rowCount).toBe(1);
    const calendarId = calendar.rows[0].id as string;
    const attendees = [
      { email: "max@example.com", displayName: "Max Bergmann", responseStatus: "accepted", isOrganizer: true },
      { email: "sam@example.com", displayName: "Sam Whitcombe", responseStatus: "accepted", isOrganizer: false },
    ];
    await database.query(
      `INSERT INTO "CalendarEvent" (id,"companyId","connectedAccountId","calendarId","unipileEventId",title,description,location,"startsAt","endsAt",timezone,"recurrenceRule",attendees,"attendeeEmails","updatedAt")
       SELECT $1,c."companyId",c."connectedAccountId",c.id,$1,'Onboarding call with Whitcombe','Agenda: import, roles, first pipeline.','Google Meet',$3::timestamptz,$4::timestamptz,'Europe/Berlin',NULL,$5::jsonb,ARRAY['max@example.com','sam@example.com'],NOW()
       FROM "Calendar" c WHERE c.id=$2`,
      [meetingId, calendarId, `${day}T13:00:00Z`, `${day}T13:45:00Z`, JSON.stringify(attendees)],
    );
    await database.query(
      `INSERT INTO "CalendarEvent" (id,"companyId","connectedAccountId","calendarId","unipileEventId",title,"startsAt","endsAt",timezone,"recurrenceRule","attendeeEmails","updatedAt")
       SELECT $1,c."companyId",c."connectedAccountId",c.id,$1,'Weekly pipeline review',$3::timestamptz,$4::timestamptz,'Europe/Berlin','RRULE:FREQ=WEEKLY',ARRAY[]::text[],NOW()
       FROM "Calendar" c WHERE c.id=$2`,
      [seriesId, calendarId, `${day}T08:00:00Z`, `${day}T08:30:00Z`],
    );
    await database.query('DELETE FROM "P13n" WHERE "companyId"=$1 AND "userId"=$2 AND "p13nId"=$3', [
      DEMO_COMPANY_ID,
      userId,
      P13N_ID,
    ]);
    await database.query(
      'INSERT INTO "P13n" (id,"companyId","userId","p13nId",settings,"updatedAt","columnOrder","hiddenColumns") VALUES ($4,$1,$2,$3,$5,NOW(),ARRAY[]::text[],ARRAY[]::text[])',
      [
        DEMO_COMPANY_ID,
        userId,
        P13N_ID,
        randomUUID(),
        JSON.stringify({ sources: [], calendarIds: [calendarId], timeZone: "Europe/Berlin", mode: "week" }),
      ],
    );

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(appPath(DEMO_SLUG, "/calendar"));
    await expect(page.locator("[data-planner-week-schedule]")).toBeVisible();
    const meeting = page.locator("[data-calendar-entry]").filter({ hasText: "Onboarding call with Whitcombe" }).first();
    await expect(meeting).toBeVisible();
    await meeting.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath("1-week.png") });

    await meeting.click();
    const editor = page.getByRole("dialog", { name: "Edit meeting" });
    await expect(editor).toBeVisible();
    const title = editor.getByRole("textbox", { name: /^Title/u });
    await expect(title).toHaveValue("Onboarding call with Whitcombe");
    await expect(editor.getByLabel("Location", { exact: true })).toHaveValue("Google Meet");
    await expect(editor.getByLabel("Description", { exact: true })).toHaveValue("Agenda: import, roles, first pipeline.");
    await expect(editor.getByText("sam@example.com")).toBeVisible();
    await expect(editor.getByText("max@example.com")).toHaveCount(0);
    await expect(editor.getByRole("switch", { name: "Send the changes to the attendees" })).toBeVisible();
    await expect(editor.getByRole("switch", { name: "Add a video link" })).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath("2-edit-meeting.png") });

    await title.fill("Onboarding call with Whitcombe (moved)");
    await expect(page.locator('[data-slot="unsaved-changes-bar"]')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("3-edit-meeting-changed.png") });

    await editor.getByRole("button", { name: "Cancel meeting", exact: true }).click();
    const confirm = page.getByRole("alertdialog", { name: "Cancel this meeting?" });
    await expect(confirm).toBeVisible();
    await settled(page);
    await page.screenshot({ path: testInfo.outputPath("4-cancel-confirmation.png") });
    await confirm.getByRole("button", { name: "Keep meeting", exact: true }).click();
    await expect(confirm).toHaveCount(0);

    const saved = await database.query('SELECT title, status FROM "CalendarEvent" WHERE id=$1', [meetingId]);
    expect(saved.rows[0]).toEqual({ title: "Onboarding call with Whitcombe", status: "confirmed" });

    await page.keyboard.press("Escape");
    const discard = page.getByRole("alertdialog");
    if (await discard.isVisible().catch(() => false))
      await discard.getByRole("button", { name: /discard/iu }).click();
    await expect(editor).toHaveCount(0);

    await page.locator("[data-calendar-entry]").filter({ hasText: "Weekly pipeline review" }).first().click();
    const detail = page.getByRole("dialog", { name: "Weekly pipeline review" });
    await expect(detail).toBeVisible();
    await expect(detail.getByText("Edit it in the original calendar.", { exact: false })).toBeVisible();
    await settled(page);
    await page.screenshot({ path: testInfo.outputPath("5-recurring-read-only.png") });
    expect(errors).toEqual([]);
  } finally {
    await database.query('DELETE FROM "CalendarEvent" WHERE id = ANY($1::text[]) AND "companyId"=$2', [
      [meetingId, seriesId],
      DEMO_COMPANY_ID,
    ]);
    await database.query('DELETE FROM "P13n" WHERE "companyId"=$1 AND "userId"=$2 AND "p13nId"=$3', [
      DEMO_COMPANY_ID,
      userId,
      P13N_ID,
    ]);
    if (previous.rowCount)
      await database.query(
        'INSERT INTO "P13n" (id,"companyId","userId","p13nId",settings,"updatedAt","columnOrder","hiddenColumns") VALUES ($4,$1,$2,$3,$5,NOW(),ARRAY[]::text[],ARRAY[]::text[])',
        [DEMO_COMPANY_ID, userId, P13N_ID, randomUUID(), previous.rows[0].settings],
      );
  }
});
