import { randomUUID } from "node:crypto";

import { formattingTagFor } from "../../i18n/locale-registry";
import { nextCronOccurrence, parseCronExpression } from "../../ee/routines/routine-schedule";
import { setPaletteText, expectPaletteText } from "./filter-palette";
import { addFromConfigure, openConfigure } from "./configure";
import { test, expect, collectPageErrors } from "./fixtures";
import { openRecordDetails } from "./record-rows";

test("persists a routine for a customer-created type and matches only its configured record changes", async ({
  page,
  database,
  companyId,
}, testInfo) => {
  test.setTimeout(240000);
  const errors = collectPageErrors(page, { console: false });
  await openConfigure(page);
  await addFromConfigure(page, "List");
  const creation = page.getByRole("dialog");
  await creation.getByRole("textbox", { name: "Name", exact: false }).first().fill("Projects");
  await creation.getByRole("button", { name: "Save", exact: true }).first().click();
  await expect(page).toHaveURL(/\/en\/records\/[a-f0-9-]+$/);
  const typeId = new URL(page.url()).pathname.split("/").at(-1);
  const field = await database.query(
    `SELECT f.id, f.definition->>'label' AS label FROM "RecordFieldDefinition" f JOIN "RecordTypeDefinition" t ON t."companyId"=f."companyId" AND t.id=f."typeId" AND t.definition->>'primaryFieldId'=f.id WHERE f."companyId"=$1 AND f."typeId"=$2`,
    [companyId, typeId],
  );
  expect(field.rows).toHaveLength(1);
  await page.goto("/en/routines");
  await page.locator("#routines-add").click();
  const routine = page.getByRole("dialog", { name: "Routine", exact: true });
  await routine.locator("#name").fill("Project follow-up");
  await routine.locator("#prompt").fill("Summarize the changed project without sending messages.");
  await routine.getByRole("combobox", { name: "Trigger", exact: false }).first().click();
  await page.getByRole("option", { name: "When something changes", exact: true }).click();
  await routine.locator("#triggerEvents").click();
  await page.getByRole("option", { name: "Record updated", exact: true }).click();
  await page.keyboard.press("Escape");
  await routine.getByRole("combobox", { name: "Records from", exact: false }).click();
  await page.getByRole("option", { name: "Projects", exact: true }).click();
  await routine.locator('[id="recordTrigger.changedFieldIds"]').click();
  await page.getByRole("option", { name: field.rows[0].label, exact: true }).click();
  await page.keyboard.press("Escape");
  await setPaletteText(page, "record-trigger-filters", "query:search", "Ready");
  await routine.getByRole("button", { name: "Save", exact: true }).click();
  await expect(routine).not.toBeVisible();
  const saved = await database.query(
    'SELECT r.id,s."typeId",s.query,s."changedFieldIds" FROM "Routine" r JOIN "RecordEventSubscription" s ON s."companyId"=r."companyId" AND s.id=r.id WHERE r."companyId"=$1 AND r.name=$2',
    [companyId, "Project follow-up"],
  );
  expect(saved.rows).toHaveLength(1);
  expect(saved.rows[0]).toMatchObject({
    typeId,
    changedFieldIds: [field.rows[0].id],
    query: { typeId, search: "Ready" },
  });
  await page.reload();
  await page.getByRole("button", { name: "Project follow-up", exact: true }).click();
  await expect(routine.getByRole("combobox", { name: "Records from", exact: false })).toContainText("Projects");
  await expect(routine.locator('[id="recordTrigger.changedFieldIds"]')).toContainText(field.rows[0].label);
  await expectPaletteText(page, "record-trigger-filters", "query:search", "Ready");
  await routine
    .locator("[data-record-trigger]")
    .screenshot({ path: testInfo.outputPath("custom-type-routine.png"), animations: "disabled" });
  await page.keyboard.press("Escape");
  await expect(routine).not.toBeVisible();
  await page.goto(`/en/records/${typeId}`);
  await page.locator("#records-add").click();
  const record = page.getByRole("dialog");
  await record.getByRole("textbox", { name: field.rows[0].label, exact: false }).fill("Draft project");
  await record.getByRole("button", { name: "Save", exact: true }).click();
  await expect(record).not.toBeVisible();
  await openRecordDetails(page, "Draft project");
  await record.getByRole("textbox", { name: field.rows[0].label, exact: false }).fill("Ready project");
  await record.getByRole("button", { name: "Save", exact: true }).click();
  await expect(record).not.toBeVisible();
  const matches = await database.query(
    'SELECT e.kind,e."subjectTypeId" AS "typeId" FROM "RecordEventMatch" m JOIN "EventLog" e ON e."companyId"=m."companyId" AND e.id=m."eventId" WHERE m."companyId"=$1 AND m."subscriptionId"=$2',
    [companyId, saved.rows[0].id],
  );
  expect(matches.rows).toEqual([{ kind: "record.updated", typeId }]);
  await expect
    .poll(
      async () => {
        const runs = await database.query(
          'SELECT status FROM "RoutineRun" WHERE "companyId"=$1 AND "routineId"=$2 ORDER BY "createdAt" DESC LIMIT 1',
          [companyId, saved.rows[0].id],
        );
        return runs.rows[0]?.status;
      },
      { timeout: 45_000 },
    )
    .toMatch(/^(succeeded|partial|failed|skipped|blocked)$/);
  expect(errors).toEqual([]);
});

test("lists a scheduled routine in words with its next run on the schedule's own clock", async ({
  page,
  database,
  companyId,
  workspace,
}) => {
  const timeZone = "America/New_York";
  const expression = "0 8 * * 1-5";
  const parsed = parseCronExpression(expression);
  if (!parsed.ok) throw new Error(parsed.reason);
  const nextRunAt = nextCronOccurrence(parsed.cron, new Date(), timeZone);
  if (!nextRunAt) throw new Error("The weekday schedule must have a next run");
  await database.query(
    'INSERT INTO "Routine" (id,"companyId","ownerUserId",name,prompt,enabled,"triggerKind","cronExpression",timezone,"triggerEvents","nextRunAt","updatedAt") VALUES ($1,$2,$3,$4,$5,true,\'schedule\',$6,$7,\'{}\',$8,NOW())',
    [
      randomUUID(),
      companyId,
      workspace.userId,
      "Task for overdue tickets",
      "Create a follow-up task for each overdue ticket.",
      expression,
      timeZone,
      nextRunAt,
    ],
  );
  await page.goto("/en/routines");
  const nextRun = new Intl.DateTimeFormat(formattingTagFor("en"), {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(nextRunAt);
  expect(nextRun).toContain("08:00");
  await expect(page.getByText(/^Weekdays at 08:00/)).toBeVisible();
  await expect(page.getByText(nextRun, { exact: true })).toBeVisible();
  await expect(page.getByText(expression, { exact: true })).toHaveCount(0);
});
