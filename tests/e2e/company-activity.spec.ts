import { randomUUID } from "node:crypto";
import { presetId } from "../../features/records/crm-preset";
import { postOk } from "./api";
import { test, expect, collectPageErrors } from "./fixtures";

test("restored records keep older workspace activity reachable across an empty projected page", async ({
  page,
  companyId,
}) => {
  test.setTimeout(300000);
  const errors = collectPageErrors(page);
  const typeId = presetId(companyId, "organization");
  const fieldId = presetId(companyId, "organization.name");
  const model = await postOk(page, "/api/v1/model/read", {});
  const refs = [];
  for (let index = 0; index < 30; index++) {
    const created = await postOk(page, "/api/v1/records/mutate", {
      expectedRevision: model.revision,
      idempotencyKey: randomUUID(),
      mutation: {
        action: "create",
        typeId,
        fields: [
          {
            fieldId,
            value: { kind: "text", value: `Activity restore ${index}` },
          },
        ],
      },
    });
    refs.push(created.refs[0]);
  }
  await postOk(page, "/api/v1/records/mutate", {
    expectedRevision: model.revision,
    idempotencyKey: randomUUID(),
    mutation: {
      action: "deleteMany",
      targets: refs.map((ref) => ({ ref, expectedVersion: 1 })),
    },
  });
  const trash = await postOk(page, "/api/v1/trash/query", {
    kinds: ["record"],
    typeIds: [typeId],
    pageSize: 100,
  });
  await postOk(page, "/api/v1/trash/restore", {
    itemIds: trash.items.map((item: { id: string }) => item.id),
  });
  const first = await postOk(page, "/api/v1/records/activities", {
    scope: { typeIds: [typeId], records: [] },
    kinds: ["record"],
    limit: 25,
  });
  expect(first.items).toHaveLength(0);
  expect(first.nextCursor).not.toBeNull();
  await page.goto("/en/settings/activity");
  const older = page.getByRole("button", { name: "Load older", exact: true });
  await expect(older).toBeVisible();
  await older.click();
  await expect(page.getByRole("button", { name: /Activity restore/ }).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("shows admin and configuration history on the workspace activity page and filters it by kind", async ({
  page,
  database,
  companyId,
}) => {
  test.setTimeout(180000);
  const errors = collectPageErrors(page);

  await page.goto("/en/settings/roles");
  await page.locator("#settings-roles-add").click();
  const role = page.getByRole("dialog", { name: "Role", exact: true });
  await role.getByRole("textbox", { name: "Name", exact: false }).fill("Activity auditors");
  await role.getByRole("textbox", { name: "Description", exact: false }).fill("Reads the workspace history");
  await role
    .locator('[data-resource-permission="activityLog"]')
    .getByRole("radio", { name: "All", exact: true })
    .check();
  await role
    .locator("[data-record-permission]")
    .filter({ hasText: /^Contacts/ })
    .getByRole("radio", { name: "All", exact: true })
    .check();
  await role.getByRole("button", { name: "Save", exact: true }).click();
  await expect(role).not.toBeVisible();

  await page.goto("/en/settings/activity");
  const admin = page.getByRole("button", { name: /Role Created/ }).first();
  const configuration = page.getByRole("button", { name: /Record access changed .*Activity auditors/ }).first();
  await expect(admin).toBeVisible();
  await expect(configuration).toBeVisible();
  await expect(page.locator("main header").getByRole("button", { name: "Filters", exact: true })).toBeVisible();
  await expect(page.locator("#global-data-views")).toHaveAttribute("data-joins-top-bar", "");

  await configuration.click();
  const detail = page.getByRole("dialog");
  await expect(detail.getByText("Contacts · Activity auditors", { exact: true })).toBeVisible();
  await expect(detail.getByText("Read access: All", { exact: true })).toBeVisible();
  await expect(detail.locator("[data-empty-value]")).toHaveCount(1);
  await expect(detail.getByText("—", { exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(detail).not.toBeVisible();

  await page.getByRole("button", { name: "Filters", exact: true }).click();
  const filters = page.getByRole("dialog", { name: "Filters" });
  await expect(filters.getByRole("option", { name: "Type", exact: true })).toBeVisible();
  for (const name of ["Provider", "Channel", "Conversation"])
    await expect(filters.getByRole("option", { name, exact: true })).toHaveCount(0);
  await filters.getByRole("option", { name: "Type", exact: true }).click();
  const configurationKind = page.getByRole("option", {
    name: "Configuration",
    exact: true,
  });
  await expect(configurationKind).toBeVisible();
  for (const name of ["Messages", "Activities"])
    await expect(page.getByRole("option", { name, exact: true })).toHaveCount(0);
  await configurationKind.click();
  const sheet = page.getByRole("dialog");
  await expect(async () => {
    if (await sheet.first().isVisible()) await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0, { timeout: 1000 });
  }).toPass();
  await expect(page.getByRole("button", { name: /Role Created/ })).toHaveCount(0);
  await expect(configuration).toBeVisible();
  await expect(page.locator("#global-data-views-all")).toHaveAttribute("data-view-modified", "");
  await expect
    .poll(async () => {
      const stored = await database.query(
        'SELECT filters FROM "P13n" WHERE "companyId"=$1 AND "p13nId"=\'activity\' AND filters <> \'[]\'::jsonb',
        [companyId],
      );
      return stored.rows.length;
    })
    .toBe(0);
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  await page.getByRole("dialog", { name: "Filters" }).getByRole("button", { name: "Save", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page.locator("#global-data-views-all")).not.toHaveAttribute("data-view-modified");

  await expect
    .poll(async () => {
      const stored = await database.query(
        'SELECT "p13nId", filters FROM "P13n" WHERE "companyId"=$1 AND "p13nId" IN (\'activity\', \'entity-timeline\')',
        [companyId],
      );
      return stored.rows;
    })
    .toEqual([
      {
        p13nId: "activity",
        filters: [{ field: "timelineKind", operator: "in", value: ["configuration"] }],
      },
    ]);

  const audit = await database.query(
    'SELECT kind, "subjectKind", "deliveredAt" IS NOT NULL AS delivered FROM "EventLog" WHERE "companyId"=$1 AND kind=\'role.created\'',
    [companyId],
  );
  expect(audit.rows).toContainEqual({
    kind: "role.created",
    subjectKind: "role",
    delivered: true,
  });
  expect(errors).toEqual([]);
});
