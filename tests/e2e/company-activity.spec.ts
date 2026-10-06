import { test, expect, isBenignPageError } from "./fixtures";

test("shows admin and configuration history on the workspace activity page and filters it by kind", async ({
  page,
  database,
  companyId,
}) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    if (!isBenignPageError(error.message)) errors.push(error.message);
  });

  await page.goto("/en/company/roles");
  await page.locator("#company-roles-add").click();
  const role = page.getByRole("dialog", { name: "Role", exact: true });
  await role.getByRole("textbox", { name: "Name", exact: false }).fill("Activity auditors");
  await role.getByRole("textbox", { name: "Description", exact: false }).fill("Reads the workspace history");
  await role
    .getByRole("radiogroup", { name: "Audit Log — Read access", exact: true })
    .getByRole("radio", { name: "All", exact: true })
    .check();
  await role
    .getByRole("radiogroup", { name: "Contacts — Read access", exact: true })
    .getByRole("radio", { name: "All", exact: true })
    .check();
  await role.getByRole("button", { name: "Save", exact: true }).click();
  await expect(role).not.toBeVisible();

  await page.goto("/en/company/activity");
  const admin = page.getByRole("button", { name: /Role Created/ }).first();
  const configuration = page.getByRole("button", { name: /Record access changed .*Activity auditors/ }).first();
  await expect(admin).toBeVisible();
  await expect(configuration).toBeVisible();

  await configuration.click();
  const detail = page.getByRole("dialog");
  await expect(detail.getByText("Activity auditors", { exact: true })).toBeVisible();
  await expect(detail.getByText("Contacts", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(detail).not.toBeVisible();

  await page.getByRole("button", { name: "Filters", exact: true }).click();
  const filters = page.getByRole("dialog", { name: "Filters" });
  await expect(filters.getByRole("option", { name: "Type", exact: true })).toBeVisible();
  for (const name of ["Provider", "Channel", "Conversation"])
    await expect(filters.getByRole("option", { name, exact: true })).toHaveCount(0);
  await filters.getByRole("option", { name: "Type", exact: true }).click();
  await page.getByRole("option", { name: "Configuration", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: /Role Created/ })).toHaveCount(0);
  await expect(configuration).toBeVisible();

  await expect
    .poll(async () => {
      const stored = await database.query(
        'SELECT "p13nId", filters FROM "P13n" WHERE "companyId"=$1 AND "p13nId" IN (\'activity\', \'entity-timeline\')',
        [companyId],
      );
      return stored.rows;
    })
    .toEqual([{ p13nId: "activity", filters: [{ field: "timelineKind", operator: "in", value: ["configuration"] }] }]);

  const audit = await database.query(
    'SELECT kind, "subjectKind", "deliveredAt" IS NOT NULL AS delivered FROM "EventLog" WHERE "companyId"=$1 AND kind=\'role.created\'',
    [companyId],
  );
  expect(audit.rows).toContainEqual({ kind: "role.created", subjectKind: "role", delivered: true });
  expect(errors).toEqual([]);
});
