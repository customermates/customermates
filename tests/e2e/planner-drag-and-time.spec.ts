import type { Client } from "pg";
import type { Locator, Page } from "@playwright/test";

import { randomUUID } from "node:crypto";

import { addCalendarDays, startOfCalendarWeek } from "../../features/record-calendar/calendar-date";
import { presetId } from "../../features/records/crm-preset";
import { postOk, readModel } from "./api";
import { collectPageErrors, expect, test } from "./fixtures";

test.use({ timezoneId: "UTC" });

const DAY_WIDTH = 36;
const HOUR_HEIGHT = 48;

async function plannerWith(
  page: Page,
  database: Client,
  companyId: string,
  userId: string,
  fields: Array<{ label: string; valueType: "dateRange" | "dateTimeRange" }>,
) {
  const typeId = presetId(companyId, "organization");
  const ids = fields.map(() => randomUUID());
  let model = await readModel(database, companyId);
  await postOk(page, "/api/v1/model/apply", {
    expectedRevision: model.revision,
    idempotencyKey: randomUUID(),
    operations: fields.map(({ label, valueType }, position) => ({
      operation: "putField",
      field: {
        id: ids[position],
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
  const sources = ids.map((dateFieldId) => ({
    id: randomUUID(),
    typeId,
    calendar: { dateFieldId },
    filters: [],
    enabled: true,
    color: "default",
  }));
  await database.query(
    'INSERT INTO "P13n" (id,"companyId","userId","p13nId",settings,"updatedAt","columnOrder","hiddenColumns") VALUES ($5,$1,$2,$3,$4,NOW(),ARRAY[]::text[],ARRAY[]::text[])',
    [
      companyId,
      userId,
      "combined-calendar",
      JSON.stringify({ mode: "month", timeZone: "UTC", calendarIds: [], sources }),
      randomUUID(),
    ],
  );
  const create = async (name: string, fieldId: string, start: string, end: string) => {
    const created = await postOk(page, "/api/v1/records/mutate", {
      expectedRevision: model.revision,
      idempotencyKey: randomUUID(),
      mutation: {
        action: "create",
        typeId,
        fields: [
          { fieldId: presetId(companyId, "organization.name"), value: { kind: "text", value: name } },
          { fieldId, value: { kind: "range", start, end } },
        ],
      },
    });
    return created.refs[0].recordId as string;
  };
  const range = async (recordId: string, fieldId: string) => {
    const result = await database.query(
      `SELECT to_char("rangeStart", 'YYYY-MM-DD"T"HH24:MI') AS start, to_char("rangeEnd", 'YYYY-MM-DD"T"HH24:MI') AS end
       FROM "RecordValue" WHERE "companyId"=$1 AND "recordId"=$2 AND "fieldId"=$3`,
      [companyId, recordId, fieldId],
    );
    return result.rows[0] as { start: string; end: string } | undefined;
  };
  return { ids, sources, create, range };
}

function updateSaved(page: Page) {
  return page.waitForResponse(
    (response) => response.request().method() === "POST" && (response.request().postData() ?? "").includes('"update"'),
  );
}

async function dragBy(page: Page, handle: Locator, dx: number, dy: number) {
  const box = await handle.boundingBox();
  if (!box) throw new Error("The drag handle must be visible");
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + Math.sign(dx) * 6, y + Math.sign(dy) * 6, { steps: 3 });
  await page.mouse.move(x + dx, y + dy, { steps: 12 });
}

test("calendar drags resize a range from either edge and move a timed entry in 15-minute steps", async ({
  page,
  database,
  companyId,
  workspace,
  isMobile,
}) => {
  test.skip(isMobile, "Phones show the agenda, which has no drag and drop");
  test.setTimeout(240000);
  const errors = collectPageErrors(page);
  const today = new Date().toISOString().slice(0, 10);
  const tuesday = addCalendarDays(startOfCalendarWeek(today), 1);
  const planner = await plannerWith(page, database, companyId, workspace.userId, [
    { label: "Project dates", valueType: "dateRange" },
    { label: "Visit window", valueType: "dateTimeRange" },
  ]);
  const [projectField, visitField] = planner.ids;
  const project = await planner.create("Drag range project", projectField, tuesday, addCalendarDays(tuesday, 1));
  const visit = await planner.create("Drag timed visit", visitField, `${today}T09:00:00Z`, `${today}T10:00:00Z`);
  const projectEntry = `${planner.sources[0].id}:${project}`;
  const visitEntry = `${planner.sources[1].id}:${visit}`;
  await page.goto("/en/calendar");
  const calendar = page.locator("[data-planner-page]");
  await expect(calendar).toBeVisible();

  await page.getByRole("tab", { name: "Timeline", exact: true }).click();
  const bar = calendar.locator(
    `[data-planner-timeline-group="${planner.sources[0].id}"] [data-calendar-entry="${projectEntry}"]`,
  );
  await expect(bar).toHaveAttribute("data-calendar-entry-end", addCalendarDays(tuesday, 1));
  await bar.evaluate((element: HTMLElement) => {
    const scroller = element.closest<HTMLElement>("[data-planner-timeline]");
    if (scroller) scroller.scrollLeft = Math.max(0, element.offsetLeft - 200);
  });
  await bar.hover();
  let saved = updateSaved(page);
  await dragBy(page, bar.locator('[data-calendar-resize="end"]'), DAY_WIDTH * 2, 0);
  await expect(bar).toHaveAttribute("data-calendar-entry-end", addCalendarDays(tuesday, 3));
  await expect(page.locator("[data-calendar-drag-preview]")).toBeVisible();
  await page.mouse.up();
  expect((await saved).ok()).toBe(true);
  await expect
    .poll(() => planner.range(project, projectField))
    .toMatchObject({ end: `${addCalendarDays(tuesday, 3)}T00:00` });
  await expect(bar).toHaveAttribute("data-calendar-entry-end", addCalendarDays(tuesday, 3));

  await page.getByRole("tab", { name: "Month", exact: true }).click();
  const segment = calendar.locator(`[data-calendar-entry="${projectEntry}"]`).first();
  await expect(segment).toHaveAttribute("data-calendar-entry-start", tuesday);
  await segment.hover();
  const monday = await calendar.locator(`[data-calendar-day="${addCalendarDays(tuesday, -1)}"]`).boundingBox();
  const start = await segment.locator('[data-calendar-resize="start"]').boundingBox();
  if (!monday || !start) throw new Error("The range start and the day before it must be visible");
  saved = updateSaved(page);
  await dragBy(page, segment.locator('[data-calendar-resize="start"]'), monday.x + monday.width / 2 - start.x, 0);
  await expect(segment).toHaveAttribute("data-calendar-entry-start", addCalendarDays(tuesday, -1));
  await page.mouse.up();
  expect((await saved).ok()).toBe(true);
  await expect
    .poll(() => planner.range(project, projectField))
    .toEqual({ start: `${addCalendarDays(tuesday, -1)}T00:00`, end: `${addCalendarDays(tuesday, 3)}T00:00` });

  await page.getByRole("tab", { name: "Week", exact: true }).click();
  const block = calendar.locator(`[data-planner-schedule-entry="${visitEntry}"]`);
  await expect(block).toBeVisible();
  await expect(calendar.locator(`[data-calendar-entry="${projectEntry}"]`).first()).toBeVisible();
  saved = updateSaved(page);
  await dragBy(page, block, 0, HOUR_HEIGHT + HOUR_HEIGHT / 4);
  await expect(page.locator("[data-calendar-drag-preview]")).toContainText("10:15");
  await page.mouse.up();
  expect((await saved).ok()).toBe(true);
  await expect.poll(() => planner.range(visit, visitField)).toEqual({ start: `${today}T10:15`, end: `${today}T11:15` });

  await block.hover();
  saved = updateSaved(page);
  await dragBy(page, block.locator('[data-calendar-resize="end"]'), 0, HOUR_HEIGHT / 2);
  await page.mouse.up();
  expect((await saved).ok()).toBe(true);
  await expect.poll(() => planner.range(visit, visitField)).toEqual({ start: `${today}T10:15`, end: `${today}T11:45` });
  expect(errors).toEqual([]);
});

test("double-clicking an hour creates a record with that time in the date-time picker", async ({
  page,
  database,
  companyId,
  workspace,
  isMobile,
}) => {
  test.skip(isMobile, "Phones show the agenda without the hourly week");
  test.setTimeout(240000);
  const errors = collectPageErrors(page);
  const today = new Date().toISOString().slice(0, 10);
  const planner = await plannerWith(page, database, companyId, workspace.userId, [
    { label: "Visit window", valueType: "dateTimeRange" },
  ]);
  await page.goto("/en/calendar");
  const calendar = page.locator("[data-planner-page]");
  await expect(calendar).toBeVisible();
  await page.getByRole("tab", { name: "Week", exact: true }).click();
  const day = calendar.locator(`[data-planner-schedule-day="${today}"]`);
  await day.dblclick({ position: { x: 20, y: HOUR_HEIGHT * 14 + 6 } });
  const drawer = page.getByRole("dialog", { name: "Organization", exact: true });
  await expect(drawer).toBeVisible();
  const picker = drawer.getByRole("button", { name: /Visit window/u }).first();
  await expect(picker).toContainText(/2:00\sPM/u);
  await picker.click();
  const startTime = page.locator('input[id$="-time-from"]');
  const endTime = page.locator('input[id$="-time-to"]');
  await expect(startTime).toHaveValue(/^2:00\sPM$/u);
  await expect(endTime).toHaveValue(/^3:00\sPM$/u);
  await startTime.press("ArrowUp");
  await expect(startTime).toHaveValue(/^2:15\sPM$/u);
  await endTime.fill("16:30");
  await endTime.press("Enter");
  await expect(endTime).toHaveValue(/^4:30\sPM$/u);
  await page.keyboard.press("Escape");
  await drawer.getByRole("textbox", { name: "Name" }).fill("Picked visit");
  await drawer.getByRole("button", { name: "Save", exact: true }).click();
  await expect
    .poll(async () => {
      const result = await database.query(
        `SELECT to_char(v."rangeStart", 'YYYY-MM-DD"T"HH24:MI') AS start, to_char(v."rangeEnd", 'YYYY-MM-DD"T"HH24:MI') AS end
         FROM "RecordValue" v JOIN "RecordValue" n ON n."companyId"=v."companyId" AND n."recordId"=v."recordId"
         WHERE v."companyId"=$1 AND v."fieldId"=$2 AND n."textValue"='Picked visit'`,
        [companyId, planner.ids[0]],
      );
      return result.rows[0];
    })
    .toEqual({ start: `${today}T14:15`, end: `${today}T16:30` });
  await expect(calendar.locator("[data-planner-schedule-entry]").filter({ hasText: "Picked visit" })).toBeVisible();
  expect(errors).toEqual([]);
});
