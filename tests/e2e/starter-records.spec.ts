import { test, expect, isAppConsoleError, isBenignPageError } from "./fixtures";
import { openRecordDetails } from "./record-rows";
import { presetId } from "../../features/records/crm-preset";

test("creates, edits, connects, assigns, reloads, and deletes all five starter types without legacy storage", async ({
  page,
  database,
  companyId,
  workspace,
}, testInfo) => {
  test.setTimeout(240000);
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    if (!isBenignPageError(error.message)) errors.push(error.message);
  });
  page.on("console", (message) => {
    if (isAppConsoleError(message)) errors.push(message.text());
  });
  const dialog = page.getByRole("dialog");
  const navigateToType = async (typeId: string) => {
    const href = `/en/records/${typeId}`;
    if (new URL(page.url()).pathname === href) return;
    if (!(await page.locator(`[id="nav-records:${typeId}"]`).isVisible()))
      await page.locator("#sidebar-trigger").click();
    await page.locator(`[id="nav-records:${typeId}"]`).click();
    await expect(page).toHaveURL(new RegExp(`${href}(?:\\?.*)?$`));
    await expect(page.locator("#records-add")).toBeVisible();
  };
  const records = new Map<string, { id: string; typeId: string; title: string }>();
  await page.goto(`/en/records/${presetId(companyId, "contact")}`);
  for (const [kind, label] of [
    ["contact", "Contact"],
    ["organization", "Organization"],
    ["deal", "Deal"],
    ["service", "Service"],
    ["task", "Task"],
  ]) {
    const typeId = presetId(companyId, kind);
    const title = `Journey ${label} A`;
    await navigateToType(typeId);
    await page.locator("#records-add").click();
    if (kind === "contact") {
      await dialog.getByRole("textbox", { name: "First name", exact: false }).fill("Journey");
      await dialog.getByRole("textbox", { name: "Last name", exact: false }).fill("Contact A");
    } else await dialog.getByRole("textbox", { name: "Name", exact: false }).fill(title);
    if (kind === "service") await dialog.getByRole("textbox", { name: "Price", exact: false }).fill("17.125");
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await openRecordDetails(page, title);
    if (kind === "contact") await dialog.getByRole("textbox", { name: "Last name", exact: false }).fill("Contact B");
    else await dialog.getByRole("textbox", { name: "Name", exact: false }).fill(`Journey ${label} B`);
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await page.reload();
    const updatedTitle = `Journey ${label} B`;
    await expect(page.getByRole("link", { name: updatedTitle, exact: true })).toBeVisible();
    const saved = await database.query(
      'SELECT r.id,a."userId" FROM "CrmRecord" r JOIN "RecordValue" v ON v."companyId"=r."companyId" AND v."typeId"=r."typeId" AND v."recordId"=r.id JOIN "RecordAssignment" a ON a."companyId"=r."companyId" AND a."typeId"=r."typeId" AND a."recordId"=r.id WHERE r."companyId"=$1 AND r."typeId"=$2 AND v."fieldId"=$3 AND v."textValue"=$4',
      [companyId, typeId, presetId(companyId, `${kind}.name`), updatedTitle],
    );
    expect(saved.rows).toHaveLength(1);
    expect(saved.rows[0].userId).toBe(workspace.userId);
    records.set(kind, { id: saved.rows[0].id, typeId, title: updatedTitle });
    await page.screenshot({ path: testInfo.outputPath(`starter-${kind}-table.png`), animations: "disabled" });
  }
  const task = records.get("task")!;
  await openRecordDetails(page, task.title);
  for (const [kind, label] of [
    ["contact", "Contacts"],
    ["organization", "Organizations"],
    ["deal", "Deals"],
    ["service", "Services"],
  ]) {
    await dialog.getByRole("combobox", { name: label, exact: true }).click();
    await page.getByRole("option", { name: records.get(kind)!.title, exact: true }).click();
  }
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const links = await database.query(
    'SELECT "relationId","targetTypeId","targetId" FROM "RecordLink" WHERE "companyId"=$1 AND "sourceTypeId"=$2 AND "sourceId"=$3 ORDER BY "relationId"',
    [companyId, task.typeId, task.id],
  );
  expect(links.rows).toEqual(
    [...records.entries()]
      .filter(([kind]) => kind !== "task")
      .map(([kind, record]) => ({
        relationId: presetId(companyId, `task.${kind}s`),
        targetTypeId: record.typeId,
        targetId: record.id,
      }))
      .sort((left, right) => left.relationId.localeCompare(right.relationId)),
  );
  await page.reload();
  await openRecordDetails(page, task.title);
  for (const [kind, record] of records) {
    if (kind !== "task") await expect(dialog.getByText(record.title, { exact: true })).toBeVisible();
  }
  await page.screenshot({
    path: testInfo.outputPath("starter-task-connections.png"),
    animations: "disabled",
  });
  await page.keyboard.press("Escape");
  for (const record of [task, ...[...records.values()].filter((record) => record.id !== task.id)]) {
    await navigateToType(record.typeId);
    await openRecordDetails(page, record.title);
    await dialog.getByRole("button", { name: "Delete", exact: true }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByRole("link", { name: record.title, exact: true })).not.toBeVisible();
  }
  const remaining = await database.query(
    'SELECT COUNT(*)::integer AS count FROM "CrmRecord" WHERE "companyId"=$1 AND id=ANY($2::text[])',
    [companyId, [...records.values()].map((record) => record.id)],
  );
  expect(remaining.rows).toEqual([{ count: 0 }]);
  const events = await database.query(
    'SELECT "subjectId" AS "recordId",array_agg(DISTINCT kind ORDER BY kind) AS kinds FROM "EventLog" WHERE "companyId"=$1 AND "subjectId"=ANY($2::text[]) GROUP BY "subjectId"',
    [companyId, [...records.values()].map((record) => record.id)],
  );
  expect(events.rows).toHaveLength(5);
  for (const event of events.rows) expect(event.kinds).toEqual(["record.created", "record.deleted", "record.updated"]);
  const retired = await database.query(
    "SELECT to_regclass('\"Contact\"') AS contacts,to_regclass('\"Organization\"') AS organizations,to_regclass('\"Deal\"') AS deals,to_regclass('\"Service\"') AS services,to_regclass('\"Task\"') AS tasks",
  );
  expect(Object.values(retired.rows[0])).toEqual([null, null, null, null, null]);
  expect(errors).toEqual([]);
});
