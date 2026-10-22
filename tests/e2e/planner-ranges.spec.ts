import { randomUUID } from "node:crypto";

import {
  addCalendarDays,
  calendarDayDifference,
  endOfCalendarMonth,
  endOfCalendarWeek,
} from "../../features/record-calendar/calendar-date";
import { presetId } from "../../features/records/crm-preset";
import { postOk, readModel } from "./api";
import { collectPageErrors, expect, test } from "./fixtures";

test("calendar ranges span weeks and months, keep midnight exclusive, reveal full titles and move by the dragged distance", async ({
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
        timeZone: "UTC",
        calendarIds: [],
        sources: [
          {
            id: sourceId,
            typeId,
            calendar: { dateFieldId: dateField },
            filters: [],
            enabled: true,
            color: "default",
          },
          {
            id: timeSourceId,
            typeId,
            calendar: { dateFieldId: timeField },
            filters: [],
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
    await expect(midnight).toHaveAttribute("data-calendar-entry-start", today);
    await expect(midnight).toHaveAttribute("data-calendar-entry-end", today);
    await expect(midnight).toHaveCSS("height", "720px");
    await midnight.hover();
    await expect(page.getByRole("tooltip")).toContainText(timedTitle);
    await page.getByRole("tab", { name: "Quarter", exact: true }).click();
    await expect(calendar.locator('[data-planner-timeline][data-planner-scale="week"]')).toBeVisible();
    await expect(entry).toHaveAttribute("data-calendar-entry-end", end);
    await page.getByRole("tab", { name: "Timeline", exact: true }).click();
    const bar = calendar.locator(`[data-planner-timeline-group="${sourceId}"] [data-calendar-entry="${entryId}"]`);
    await expect(bar).toHaveAttribute("data-calendar-entry-start", start);
    await expect(bar).toHaveAttribute("data-calendar-entry-end", end);
    await expect(bar).toHaveCSS("width", `${(calendarDayDifference(start, end) + 1) * 36 - 2}px`);
    await bar.hover();
    await expect(page.getByRole("tooltip")).toContainText(title);
    await page.screenshot({ path: testInfo.outputPath("calendar-ranges-timeline.png") });
    await page.mouse.move(0, 0);
    await expect(page.getByRole("tooltip")).toHaveCount(0);

    await page.getByRole("tab", { name: "Month", exact: true }).click();
    const segment = calendar.locator(`[data-calendar-entry="${entryId}"]`).first();
    await expect(segment).toHaveAttribute("data-calendar-entry-start", start);
    const segmentEnd = end < endOfCalendarWeek(start) ? end : endOfCalendarWeek(start);
    const dropDay = calendar.locator(`[data-calendar-day="${addCalendarDays(segmentEnd, -1)}"]`);
    const segmentBox = await segment.boundingBox();
    const grabBox = await calendar.locator(`[data-calendar-day="${segmentEnd}"]`).boundingBox();
    const dropBox = await dropDay.boundingBox();
    if (!segmentBox || !grabBox || !dropBox) throw new Error("The range and the days around it must be visible");
    const saved = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" && (response.request().postData() ?? "").includes('"update"'),
    );
    const grabX = grabBox.x + grabBox.width / 2;
    const grabY = segmentBox.y + segmentBox.height / 2;
    await page.mouse.move(grabX, grabY);
    await page.mouse.down();
    await page.mouse.move(grabX - 8, grabY, { steps: 4 });
    await page.mouse.move(dropBox.x + dropBox.width / 2, dropBox.y + dropBox.height / 2, { steps: 16 });
    await expect(segment).toHaveAttribute("data-calendar-entry-start", addCalendarDays(start, -1));
    await page.mouse.up();
    expect((await saved).ok()).toBe(true);
    await expect(segment).toHaveAttribute("data-calendar-entry-start", addCalendarDays(start, -1));
    await expect(segment).toHaveAttribute("data-calendar-entry-end", addCalendarDays(end, -1));
  }
  expect(errors).toEqual([]);
});
