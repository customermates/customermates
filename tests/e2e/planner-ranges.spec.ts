import { randomUUID } from "node:crypto";

import {
  addCalendarDays,
  calendarDayDifference,
  endOfCalendarMonth,
} from "../../features/record-calendar/calendar-date";
import { presetId } from "../../features/records/crm-preset";
import { postOk, readModel } from "./api";
import { collectPageErrors, expect, test } from "./fixtures";

test("calendar ranges span weeks and months, keep midnight exclusive, and reveal full titles", async ({
  page,
  database,
  companyId,
  workspace,
  isMobile,
}, testInfo) => {
  test.setTimeout(240000);
  const errors = collectPageErrors(page);
  const today = new Date().toISOString().slice(0, 10);
  const start = addCalendarDays(endOfCalendarMonth(today), -2);
  const end = addCalendarDays(endOfCalendarMonth(today), 3);
  const typeId = presetId(companyId, "organization");
  const dateField = randomUUID();
  const timeField = randomUUID();
  const title = "Quarterly implementation and customer onboarding across the month boundary with the complete title";
  const timedTitle = "Midnight handover with a deliberately long title for the calendar tooltip";
  let model = await readModel(database, companyId);
  await postOk(page, "/api/v1/model/apply", {
    expectedRevision: model.revision,
    idempotencyKey: randomUUID(),
    operations: [
      [dateField, "Project dates", "dateRange"],
      [timeField, "Handover dates", "dateTimeRange"],
    ].map(([id, label, valueType], position) => ({
      operation: "putField",
      field: {
        id,
        typeId,
        label,
        valueType,
        required: false,
        multiple: false,
        behavior: { kind: "input" },
        archived: false,
        options: [],
        position: 100 + position,
      },
    })),
  });
  model = await readModel(database, companyId);
  const create = async (name: string, fieldId: string, from: string, to: string) =>
    postOk(page, "/api/v1/records/mutate", {
      expectedRevision: model.revision,
      idempotencyKey: randomUUID(),
      mutation: {
        action: "create",
        typeId,
        fields: [
          { fieldId: presetId(companyId, "organization.name"), value: { kind: "text", value: name } },
          { fieldId, value: { kind: "range", start: from, end: to } },
        ],
      },
    });
  const allDay = await create(title, dateField, start, end);
  const timed = await create(timedTitle, timeField, `${today}T09:00:00Z`, `${addCalendarDays(today, 1)}T00:00:00Z`);
  const sourceId = randomUUID();
  const timeSourceId = randomUUID();
  await database.query(
    'INSERT INTO "P13n" (id,"companyId","userId","p13nId",settings,"updatedAt","columnOrder","hiddenColumns") VALUES ($5,$1,$2,$3,$4,NOW(),ARRAY[]::text[],ARRAY[]::text[])',
    [
      companyId,
      workspace.userId,
      "combined-calendar",
      JSON.stringify({
        mode: "month",
        sort: "date",
        timeZone: "UTC",
        calendarIds: [],
        sources: [
          {
            id: sourceId,
            typeId,
            calendar: { dateFieldId: dateField },
            filters: [],
            search: "",
            enabled: true,
            color: "default",
          },
          {
            id: timeSourceId,
            typeId,
            calendar: { dateFieldId: timeField },
            filters: [],
            search: "",
            enabled: true,
            color: "secondary",
          },
        ],
      }),
      randomUUID(),
    ],
  );
  const entryId = `${sourceId}:${allDay.refs[0].recordId}`;
  const timedId = `${timeSourceId}:${timed.refs[0].recordId}`;
  await page.goto("/en/calendar");
  const calendar = page.locator("[data-planner-page]");
  await expect(calendar).toBeVisible();
  const entry = calendar.locator(`[data-calendar-entry="${entryId}"]`).first();
  await expect(entry).toHaveAttribute("data-calendar-entry-start", start);
  await expect(entry).toHaveAttribute("data-calendar-entry-end", end);
  const pageBounds = await calendar.boundingBox();
  const bodyBounds = await page.locator("#scroll-container").boundingBox();
  expect(pageBounds?.width).toBe(bodyBounds?.width);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  if (isMobile) {
    await expect(calendar.locator('[data-calendar-mode="agenda"]')).toBeVisible();
    await entry.click();
    await expect(page.getByRole("dialog", { name: "Organization", exact: true })).toContainText(title);
  } else {
    await entry.hover();
    await expect(page.getByRole("tooltip")).toContainText(title);
    await page.mouse.move(0, 0);
    await entry.focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    await expect(page.getByRole("tooltip")).toContainText(title);
    await page.getByRole("tab", { name: "Week", exact: true }).click();
    const midnight = calendar.locator(`[data-planner-schedule-entry="${timedId}"]`);
    await expect(midnight).toHaveCount(1);
    await expect(midnight).toHaveAttribute("data-planner-range-start", today);
    await expect(midnight).toHaveAttribute("data-planner-range-end", today);
    await expect(midnight).toHaveCSS("height", "720px");
    await midnight.hover();
    await expect(page.getByRole("tooltip")).toContainText(timedTitle);
    await page.getByRole("tab", { name: "Quarter", exact: true }).click();
    await expect(calendar.locator("[data-planner-quarter] > section")).toHaveCount(3);
    await expect(entry).toHaveAttribute("data-calendar-entry-end", end);
    await page.getByRole("tab", { name: "Timeline", exact: true }).click();
    const bar = calendar.locator(`[data-planner-timeline-row="${entryId}"] [data-planner-range-start]`);
    await expect(bar).toHaveAttribute("data-planner-range-start", start);
    await expect(bar).toHaveAttribute("data-planner-range-end", end);
    await expect(bar).toHaveCSS("width", `${(calendarDayDifference(start, end) + 1) * 28 - 4}px`);
    await bar.hover();
    await expect(page.getByRole("tooltip")).toContainText(title);
    await page.screenshot({ path: testInfo.outputPath("calendar-ranges-timeline.png") });
  }
  expect(errors).toEqual([]);
});
