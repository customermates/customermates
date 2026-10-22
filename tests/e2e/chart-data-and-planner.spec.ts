import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { e2eAppMode } from "./workspace-switching";
import germanMessages from "../../i18n/locales/de.json" with { type: "json" };
import { DEMO_COMPANY_ID, DEMO_MEMBERS, demoId, expect, test } from "./demo-seed";

test("chart bars open their records and carry the same selection to the overview list", async ({
  page,
  database,
  errors,
}, testInfo) => {
  test.setTimeout(180000);
  const widgets = await database.query(
    'SELECT id FROM "Widget" WHERE "companyId"=$1 AND name=$2 AND "deletedAt" IS NULL',
    [DEMO_COMPANY_ID, "Open pipeline by stage"],
  );
  const id = widgets.rows[0].id as string;
  await page.goto("/en/dashboard");
  const card = page.locator(`[data-focus-target="widget:${id}"]`);
  await expect(card).toBeVisible();
  const bar = card.locator("[data-chart-point]").first();
  await expect(bar).toBeVisible();
  await bar.click();
  const drawer = page.getByRole("dialog", { name: "Data for Open pipeline by stage" });
  await expect(drawer).toBeVisible();
  await expect(drawer.locator("[data-widget-records]")).toBeVisible();
  await expect(drawer.locator("[data-widget-data-table]")).toContainText(/.+/u);
  if (testInfo.project.name === "mobile") {
    const rows = drawer.locator("[data-widget-data-table]");
    await expect.poll(() => rows.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
    const last = rows.locator("[data-row-id]").last();
    await last.scrollIntoViewIfNeeded();
    await expect(last).toBeInViewport();
    expect(await rows.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  }
  await page.screenshot({ path: testInfo.outputPath("chart-data-drawer.png") });
  const href = await drawer.getByRole("link", { name: "Open in Deals" }).getAttribute("href");
  expect(href).toContain("filters=");
  expect(href).toContain("viewMode=table");
  await drawer.getByRole("link", { name: "Open in Deals" }).click();
  await expect(page).toHaveURL(new RegExp(`/records/${demoId("deal")}`));
  await expect(page.locator('[data-slot="calendar-root"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  await expect(page.getByText("Open pipeline by stage · New", { exact: false }).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("combined calendar adds two lists, toggles sources, opens records, exports and revokes a private subscription", async ({
  page,
  database,
  errors,
}, testInfo) => {
  test.setTimeout(240000);
  const userId = DEMO_MEMBERS.maxBergmann.userId;
  const previous = await database.query(
    'SELECT settings FROM "P13n" WHERE "companyId"=$1 AND "userId"=$2 AND "p13nId"=$3',
    [DEMO_COMPANY_ID, userId, "combined-calendar"],
  );
  let subscriptionUrl: string | null = null;
  const recurringEventId = randomUUID();
  try {
    await database.query('DELETE FROM "P13n" WHERE "companyId"=$1 AND "userId"=$2 AND "p13nId"=$3', [
      DEMO_COMPANY_ID,
      userId,
      "combined-calendar",
    ]);
    if (e2eAppMode() !== "self-hosted")
      await database.query(
        `INSERT INTO "CalendarEvent" (id,"companyId","connectedAccountId","calendarId","unipileEventId",title,"startsAt","endsAt",timezone,"recurrenceRule","attendeeEmails","updatedAt")
         SELECT $1,c."companyId",c."connectedAccountId",c.id,$1,'Planner recurring meeting','2025-10-01T09:00:00Z','2025-10-01T10:00:00Z','UTC','RRULE:FREQ=WEEKLY',ARRAY[]::text[],NOW()
         FROM "Calendar" c WHERE c."companyId"=$2 AND c.name='Customer meetings' LIMIT 1`,
        [recurringEventId, DEMO_COMPANY_ID],
      );
    await page.goto("/en/calendar");
    await expect(page.locator("[data-planner-page]")).toBeVisible();
    async function add(list: string, dateField: string) {
      await page.getByRole("button", { name: "Add date source", exact: true }).first().click();
      const modal = page.getByRole("dialog", { name: "Add date source" });
      await modal.getByRole("combobox", { name: "List", exact: true }).click();
      await page.getByRole("option", { name: list, exact: true }).click();
      await modal.getByRole("combobox", { name: "Start or date range", exact: true }).click();
      await page.getByRole("option", { name: dateField, exact: true }).click();
      await modal.getByRole("button", { name: "Save", exact: true }).click();
      await expect(modal).not.toBeVisible();
    }
    await add("Deals", "Close date");
    await add("Tasks", "Due date");
    await page.getByRole("button", { name: "Date sources", exact: true }).click();
    const sources = page.getByRole("dialog", { name: "Date sources", exact: true });
    await expect(sources.locator("[data-planner-source]")).toHaveCount(2);

    if (e2eAppMode() !== "self-hosted") {
      const connected = page.getByRole("checkbox", { name: /Customer meetings/u });
      await expect(connected).toBeVisible();
      await connected.check();
      await expect(connected).toBeChecked();

    } else await expect(page.getByRole("heading", { name: "My connected calendars" })).toHaveCount(0);
    const toggle = page.getByRole("checkbox", { name: "Tasks · Due date", exact: true });
    await toggle.uncheck();
    await expect(toggle).not.toBeChecked();
    await toggle.check();
    await sources.getByRole("button", { name: "Close", exact: true }).click();
    await expect(sources).toHaveCount(0);
    await expect(page.locator("[data-calendar-entry]").first()).toBeVisible();
    if (e2eAppMode() !== "self-hosted") await expect(page.locator("[data-calendar-entry]").filter({ hasText: "Planner recurring meeting" }).first()).toBeVisible();
    if (testInfo.project.name !== "mobile") {
      await page.getByRole("tab", { name: "Week", exact: true }).click();
      await expect(page.locator("[data-planner-week-schedule]")).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath("combined-week.png") });
      await page.getByRole("tab", { name: "Quarter", exact: true }).click();
      await expect(page.locator('[data-planner-timeline][data-planner-scale="week"]')).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath("combined-quarter.png") });
      await page.getByRole("tab", { name: "Timeline", exact: true }).click();
      await expect(page.locator("[data-planner-timeline-group]")).toHaveCount(e2eAppMode() === "self-hosted" ? 2 : 3);
      await page.locator("[data-planner-timeline-bar]").first().click();
      await expect(page.getByRole("dialog").last()).toBeVisible();
      await page.keyboard.press("Escape");
      await page.getByRole("tab", { name: "Month", exact: true }).click();
    } else await expect(page.locator('[data-calendar-mode="agenda"]')).toBeVisible();
    await expect(page.locator('[data-slot="unsaved-changes-bar"]')).toHaveCount(0);
    await expect
      .poll(async () => {
        const saved = await database.query(
          'SELECT settings FROM "P13n" WHERE "companyId"=$1 AND "userId"=$2 AND "p13nId"=$3',
          [DEMO_COMPANY_ID, userId, "combined-calendar"],
        );
        const settings = saved.rows[0]?.settings as
          | { mode: string; calendarIds: string[]; sources: { enabled: boolean }[] }
          | undefined;
        return settings
          ? {
              mode: settings.mode,
              calendars: settings.calendarIds.length,
              enabled: settings.sources.filter((source) => source.enabled).length,
            }
          : null;
      })
      .toEqual({ mode: "month", calendars: e2eAppMode() === "self-hosted" ? 0 : 1, enabled: 2 });
    await page.reload();
    await page.getByRole("button", { name: "Date sources", exact: true }).click();
    await expect(sources.locator("[data-planner-source]")).toHaveCount(2);
    await sources.getByRole("button", { name: "Close", exact: true }).click();
    await page.getByRole("button", { name: "Export & subscribe", exact: true }).click();
    const sync = page.getByRole("dialog", { name: "Export & subscribe" });
    const downloaded = page.waitForEvent("download");
    await sync.getByRole("button", { name: "Download .ics", exact: true }).click();
    const download = await downloaded;
    const path = testInfo.outputPath("calendar.ics");
    await download.saveAs(path);
    const content = await readFile(path, "utf8");
    expect(content).toContain("BEGIN:VCALENDAR\r\n");
    expect(content).toContain("BEGIN:VEVENT\r\n");
    expect(content).not.toContain("Planner recurring meeting");
    if (e2eAppMode() !== "self-hosted")
      await sync.getByRole("checkbox", { name: /Also include selected connected events/u }).check();
    await sync.getByRole("button", { name: "Create subscription URL", exact: true }).click();
    const url = await sync.getByRole("textbox", { name: "Private subscription URL" }).inputValue();
    subscriptionUrl = url;
    const response = await page.request.get(url, { timeout: 90000 });
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toBe("private, no-store");
    expect(await response.text()).toContain("BEGIN:VEVENT");
    if (e2eAppMode() !== "self-hosted") expect(await response.text()).toContain("Planner recurring meeting");
    const stored = await database.query(
      'SELECT "tokenHash",config FROM "CalendarSubscription" WHERE "companyId"=$1 AND "userId"=$2 ORDER BY "createdAt" DESC LIMIT 1',
      [DEMO_COMPANY_ID, userId],
    );
    expect(stored.rows[0].tokenHash).not.toContain(url.split("/").at(-1));
    const priorRole = await database.query('SELECT "roleId" FROM "User" WHERE id=$1 AND "companyId"=$2', [
      userId,
      DEMO_COMPANY_ID,
    ]);
    const deniedRole = randomUUID();
    await database.query(
      'INSERT INTO "UserRole" (id,"companyId",name,"isSystemRole","updatedAt") VALUES ($1,$2,$3,false,NOW())',
      [deniedRole, DEMO_COMPANY_ID, "Planner permission test"],
    );
    try {
      await database.query('UPDATE "User" SET "roleId"=$1 WHERE id=$2 AND "companyId"=$3', [
        deniedRole,
        userId,
        DEMO_COMPANY_ID,
      ]);
      const denied = await page.request.get(url, { timeout: 90000 });
      expect(denied.status()).toBe(200);
      expect(await denied.text()).not.toContain("BEGIN:VEVENT");
    } finally {
      await database.query('UPDATE "User" SET "roleId"=$1 WHERE id=$2 AND "companyId"=$3', [
        priorRole.rows[0].roleId,
        userId,
        DEMO_COMPANY_ID,
      ]);
      await database.query('DELETE FROM "UserRole" WHERE id=$1 AND "companyId"=$2', [deniedRole, DEMO_COMPANY_ID]);
    }
    await database.query('UPDATE "User" SET status=$1 WHERE id=$2 AND "companyId"=$3', [
      "inactive",
      userId,
      DEMO_COMPANY_ID,
    ]);
    try {
      expect((await page.request.get(url, { timeout: 90000 })).status()).toBe(410);
    } finally {
      await database.query('UPDATE "User" SET status=$1 WHERE id=$2 AND "companyId"=$3', [
        "active",
        userId,
        DEMO_COMPANY_ID,
      ]);
    }
    await sync.getByRole("button", { name: "Revoke subscription", exact: true }).first().click();
    await expect(sync.getByRole("textbox", { name: "Private subscription URL" })).toHaveCount(0);
    expect((await page.request.get(url, { timeout: 90000 })).status()).toBe(410);
    expect(errors).toEqual([]);
  } finally {
    await database.query('DELETE FROM "CalendarEvent" WHERE id=$1 AND "companyId"=$2', [recurringEventId, DEMO_COMPANY_ID]);
    if (subscriptionUrl)
      await database.query('DELETE FROM "CalendarSubscription" WHERE "companyId"=$1 AND "userId"=$2', [
        DEMO_COMPANY_ID,
        userId,
      ]);
    if (previous.rowCount)
      await database.query('UPDATE "P13n" SET settings=$1 WHERE "companyId"=$2 AND "userId"=$3 AND "p13nId"=$4', [
        previous.rows[0].settings,
        DEMO_COMPANY_ID,
        userId,
        "combined-calendar",
      ]);
    else
      await database.query('DELETE FROM "P13n" WHERE "companyId"=$1 AND "userId"=$2 AND "p13nId"=$3', [
        DEMO_COMPANY_ID,
        userId,
        "combined-calendar",
      ]);
  }
});

test("German chart appearance labels fit and edit stays available through the local menu", async ({
  page,
  database,
  errors,
}, testInfo) => {
  const widgets = await database.query(
    'SELECT id FROM "Widget" WHERE "companyId"=$1 AND name=$2 AND "deletedAt" IS NULL',
    [DEMO_COMPANY_ID, "Open pipeline by stage"],
  );
  const priorLanguage = await database.query('SELECT "displayLanguage" FROM "User" WHERE id=$1 AND "companyId"=$2', [
    DEMO_MEMBERS.maxBergmann.userId,
    DEMO_COMPANY_ID,
  ]);
  await database.query('UPDATE "User" SET "displayLanguage"=$1 WHERE id=$2 AND "companyId"=$3', [
    "de",
    DEMO_MEMBERS.maxBergmann.userId,
    DEMO_COMPANY_ID,
  ]);
  try {
    await page.goto("/de/dashboard");
    const card = page.locator(`[data-focus-target="widget:${widgets.rows[0].id}"]`);
    await expect(card.locator("[data-chart-point]").first()).toBeVisible();
    const edit = germanMessages.Dashboard.widgetEditor.editTitle.replace("{name}", "Open pipeline by stage");
    await expect(card.getByRole("button", { name: edit, exact: true })).toHaveCount(1);
    await expect(card.getByRole("button", {
      name: germanMessages.RecordModel.moreActions.replace("{name}", "Open pipeline by stage"),
      exact: true,
    })).toHaveCount(0);
    if (testInfo.project.name === "mobile") await card.getByRole("button", { name: edit, exact: true }).first().click();
    else {
      await card.click({ button: "right" });
      await page.getByRole("menuitem", { name: edit, exact: true }).click();
    }
    const dialog = page.getByRole("dialog");
    await expect(dialog).toHaveCount(1);
    await expect(dialog).toBeVisible();
    const appearance = dialog.getByRole("tab", {
      name: germanMessages.Dashboard.widgetEditor.tabs.appearance,
      exact: true,
    });
    await expect(appearance).toBeVisible();
    await appearance.click();
    const labels = dialog.locator('label[for^="display-type-"]');
    await expect(labels.first()).toBeVisible();
    const overflow = await labels.evaluateAll((elements) =>
      elements.filter((element) => element.scrollWidth > element.clientWidth + 1).map((element) => element.textContent),
    );
    expect(overflow).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath("german-chart-appearance.png") });
    expect(errors).toEqual([]);
  } finally {
    await database.query('UPDATE "User" SET "displayLanguage"=$1 WHERE id=$2 AND "companyId"=$3', [
      priorLanguage.rows[0].displayLanguage,
      DEMO_MEMBERS.maxBergmann.userId,
      DEMO_COMPANY_ID,
    ]);
  }
});
