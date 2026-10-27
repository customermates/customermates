import type { Locator, Page } from "@playwright/test";

import { addCalendarDays, calendarWeekdayIndex } from "../../features/record-calendar/calendar-date";
import { moveWithKeyboard } from "./keyboard-drag";
import type { Client } from "pg";

import { presetId } from "../../features/records/crm-preset";
import { findSolution } from "../../core/solutions/solution-catalog";
import { appPath } from "./app-paths";
import { expect, test } from "./demo-seed";

const SALES = findSolution("sales-pipeline");
const SALES_COMPANY_ID = SALES.companyIds.en;

/** The seeded "Close calendar" view of the sales workspace: open opportunities by close date, coloured by stage. */
async function closeCalendarUrl(database: Client) {
  const { rows } = await database.query<{ id: string }>(
    'SELECT id FROM "DataView" WHERE "companyId"=$1 AND name=$2 AND "deletedAt" IS NULL',
    [SALES_COMPANY_ID, "Close calendar"],
  );
  const view = rows[0]?.id;
  if (!view) throw new Error("The sales workspace has no Close calendar view");
  return appPath(SALES.workspaceSlugs.en, `/records/${presetId(SALES_COMPANY_ID, "deal")}?view=${view}`);
}

let calendarUrl = "";

async function openCalendar(page: Page) {
  await page.goto(calendarUrl);
  const root = page.locator('[data-slot="calendar-root"]');
  await expect(root).toBeVisible();
  return root;
}

/** A deal that starts on a weekday other than Sunday, so the next day is in the same week row. */
async function movableEntry(page: Page) {
  const entries = page.locator("[data-calendar-entry]");
  await expect(entries.first()).toBeVisible();
  for (const entry of await entries.all()) {
    const start = await entry.getAttribute("data-calendar-entry-start");
    const id = await entry.getAttribute("data-calendar-entry");
    if (!start || !id || calendarWeekdayIndex(start) === 6) continue;
    if (!(await page.locator(`[data-calendar-day="${addCalendarDays(start, 1)}"]`).count())) continue;
    return { id, start };
  }
  throw new Error("The seeded close calendar has no deal that can move to the next day");
}

async function dragTo(page: Page, source: Locator, target: Locator) {
  const saved = page.waitForResponse(
    (response) => response.request().method() === "POST" && (response.request().postData() ?? "").includes('"update"'),
  );
  const from = await source.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error("Drag source and target must be visible");
  await page.mouse.move(from.x + 12, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + 24, from.y + from.height / 2, { steps: 4 });
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 16 });
  await expect(page.locator("[data-calendar-drag-preview]")).toBeVisible();
  await page.mouse.up();
  expect((await saved).ok()).toBe(true);
}

test.beforeEach(async ({ database }) => {
  calendarUrl = await closeCalendarUrl(database);
});

test("a calendar view moves a deal to another day by dragging and back with the keyboard", async ({
  page,
  errors,
}, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Phones show the agenda, which has no drag and drop");
  test.setTimeout(180000);
  await openCalendar(page);
  await expect(page.locator('[data-calendar-mode="month"]')).toBeVisible();
  await expect(page.getByRole("tab", { name: "Month" })).toHaveAttribute("aria-selected", "true");
  const { id, start } = await movableEntry(page);
  const next = addCalendarDays(start, 1);
  const entry = page.locator(`[data-calendar-entry="${id}"]`).first();

  await dragTo(page, entry, page.locator(`[data-calendar-day="${next}"]`));
  await expect(entry).toHaveAttribute("data-calendar-entry-start", next);

  // The move went through the record update: a reload shows the deal on its new day.
  await openCalendar(page);
  await expect(page.locator(`[data-calendar-entry="${id}"]`).first()).toHaveAttribute("data-calendar-entry-start", next);

  // Space picks the deal up, the left arrow chooses the previous day and Space drops it there.
  const saved = page.waitForResponse(
    (response) => response.request().method() === "POST" && (response.request().postData() ?? "").includes('"update"'),
  );
  await moveWithKeyboard(page, page.locator(`[data-calendar-entry="${id}"]`).first(), "ArrowLeft");
  expect((await saved).ok()).toBe(true);
  await expect(page.locator(`[data-calendar-entry="${id}"]`).first()).toHaveAttribute(
    "data-calendar-entry-start",
    start,
  );
  await openCalendar(page);
  await expect(page.locator(`[data-calendar-entry="${id}"]`).first()).toHaveAttribute(
    "data-calendar-entry-start",
    start,
  );
  expect(errors).toEqual([]);
});

test("a calendar view switches between month, week and agenda and opens a record", async ({
  page,
  errors,
}, testInfo) => {
  await openCalendar(page);
  if (testInfo.project.name === "mobile") {
    await expect(page.locator('[data-calendar-mode="agenda"]')).toBeVisible();
    await expect(page.locator("[data-calendar-agenda-day]").first()).toBeVisible();
  } else {
    await page.getByRole("tab", { name: "Week" }).click();
    await expect(page.locator('[data-calendar-mode="week"]')).toBeVisible();
    await expect(page.locator("[data-calendar-day]")).toHaveCount(7);
    await page.getByRole("tab", { name: "Agenda" }).click();
    await expect(page.locator('[data-calendar-mode="agenda"]')).toBeVisible();
    await page.getByRole("tab", { name: "Month" }).click();
    await expect(page.locator('[data-calendar-mode="month"]')).toBeVisible();
    await page.getByRole("button", { name: "Next month" }).click();
    await page.getByRole("button", { name: "Today", exact: true }).click();
  }
  const entry = page.locator("[data-calendar-entry]").first();
  await expect(entry).toBeVisible();
  await entry.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(errors).toEqual([]);
});
