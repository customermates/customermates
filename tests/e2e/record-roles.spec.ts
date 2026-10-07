import { randomUUID } from "node:crypto";
import { addFromConfigure, openConfigure, saveGeneral } from "./configure";
import { test, expect, isBenignPageError } from "./fixtures";

test("configures a role for a new type, preserves granular rights after rename and deletes the unused role", async ({
  page,
  database,
  companyId,
}, testInfo) => {
  test.setTimeout(240000);
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    if (!isBenignPageError(error.message)) errors.push(error.message);
  });
  await openConfigure(page);
  await addFromConfigure(page, "List");
  const creation = page.getByRole("dialog");
  await creation.getByRole("textbox", { name: "Name", exact: false }).first().fill("Projects");
  await creation.getByRole("button", { name: "Create list", exact: true }).first().click();
  await expect(page).toHaveURL(/\/en\/records\/[a-f0-9-]+$/);
  const typeId = new URL(page.url()).pathname.split("/").at(-1);
  expect(typeId).toBeTruthy();
  await page.goto("/en/company/roles");
  await page.locator("#company-roles-add").click();
  const role = page.getByRole("dialog", { name: "Role", exact: true });
  await role.getByRole("textbox", { name: "Name", exact: false }).fill("Project coordinators");
  await role.getByRole("textbox", { name: "Description", exact: false }).fill("Create and read assigned projects");
  const projectGrant = role.locator(`[data-record-permission="${typeId}"]`);
  const recordTypesTab = role.getByRole("tab", { name: "Record types", exact: true });
  await recordTypesTab.click();
  await expect(projectGrant.getByRole("radio", { name: "None", exact: true })).toBeChecked();
  await projectGrant.getByRole("radio", { name: "Assigned", exact: true }).check();
  await projectGrant.getByRole("checkbox", { name: "Create", exact: true }).check();
  await role.getByRole("tab", { name: "Workspace", exact: true }).click();
  const dataModel = role.locator('[data-resource-permission="dataModel"]');
  await expect(dataModel.getByRole("checkbox")).toHaveCount(1);
  await dataModel.getByRole("checkbox", { name: "Edit", exact: true }).check();
  const auditLog = role.locator('[data-resource-permission="auditLog"]');
  await expect(auditLog.getByRole("checkbox")).toHaveCount(0);
  const api = role.locator('[data-resource-permission="api"]');
  await api.getByRole("checkbox", { name: "Create", exact: true }).check();
  await api.getByRole("checkbox", { name: "Delete", exact: true }).check();
  await role.getByRole("button", { name: "Save", exact: true }).click();
  await expect(role).not.toBeVisible();
  const saved = await database.query('SELECT id FROM "UserRole" WHERE "companyId"=$1 AND name=$2', [
    companyId,
    "Project coordinators",
  ]);
  expect(saved.rows).toHaveLength(1);
  const roleId = saved.rows[0].id;
  const grants = () =>
    database.query(
      'SELECT "typeId", actions::text[] AS actions FROM "RecordTypeGrant" WHERE "companyId"=$1 AND "roleId"=$2',
      [companyId, roleId],
    );
  expect((await grants()).rows).toEqual([{ typeId, actions: ["create", "readOwn"] }]);
  expect(
    (
      await database.query(
        'SELECT action FROM "RolePermission" WHERE "companyId"=$1 AND "roleId"=$2 AND resource=\'dataModel\' AND action=\'update\'',
        [companyId, roleId],
      )
    ).rows,
  ).toHaveLength(1);
  expect(
    (
      await database.query(
        'SELECT action::text FROM "RolePermission" WHERE "roleId"=$1 AND resource IN (\'api\', \'dataModel\') ORDER BY resource, action',
        [roleId],
      )
    ).rows.map(({ action }) => action),
  ).toEqual(["readAll", "readOwn", "update", "create", "delete"]);
  await page.reload();
  await page.getByRole("button", { name: "Project coordinators", exact: true }).click();
  await recordTypesTab.click();
  await expect(projectGrant.getByRole("checkbox", { name: "Create", exact: true })).toBeChecked();
  await expect(projectGrant.getByRole("checkbox", { name: "Edit", exact: true })).not.toBeChecked();
  await expect(projectGrant.getByRole("checkbox", { name: "Delete", exact: true })).not.toBeChecked();
  const beforeRename = await page.request.post("/api/v1/roles/read", { data: { id: roleId } });
  expect(beforeRename.ok()).toBe(true);
  const before = await beforeRename.json();
  await page.keyboard.press("Escape");
  await expect(role).not.toBeVisible();
  await openConfigure(page, typeId);
  await page
    .getByRole("region", { name: "General", exact: true })
    .getByRole("textbox", { name: "Navigation label", exact: true })
    .fill("Initiatives");
  await saveGeneral(page);
  const stale = await page.request.post("/api/v1/roles/delete", {
    data: { id: roleId, expectedRevision: before.schemaRevision, idempotencyKey: randomUUID() },
  });
  expect(stale.status()).toBe(409);
  expect((await grants()).rows).toEqual([{ typeId, actions: ["create", "readOwn"] }]);
  await page.goto("/en/company/roles");
  await page.getByRole("button", { name: "Project coordinators", exact: true }).click();
  await expect(role).toBeVisible();
  await recordTypesTab.click();
  await projectGrant.scrollIntoViewIfNeeded();
  await expect(projectGrant.getByText("Initiatives", { exact: true })).toBeVisible();
  if (testInfo.project.name === "mobile")
    expect((await projectGrant.getByText("Initiatives", { exact: true }).boundingBox())?.width).toBeGreaterThan(120);
  await expect(projectGrant.getByRole("radio", { name: "Assigned", exact: true })).toBeChecked();
  await projectGrant.getByRole("radio", { name: "All", exact: true }).check();
  await projectGrant.getByRole("checkbox", { name: "Edit", exact: true }).check();
  await projectGrant.screenshot({ path: testInfo.outputPath("dynamic-role-permissions.png"), animations: "disabled" });
  await role.getByRole("button", { name: "Save", exact: true }).click();
  await expect(role).not.toBeVisible();
  expect((await grants()).rows).toEqual([{ typeId, actions: ["create", "update", "readAll"] }]);
  await page.getByRole("button", { name: "Project coordinators", exact: true }).click();
  await role.locator("#role-modal-delete").click();
  await page.getByRole("alertdialog").locator("#confirm-delete").click();
  await expect(page.getByRole("alertdialog")).not.toBeVisible();
  await expect(role).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Project coordinators", exact: true })).toHaveCount(0);
  await expect.poll(async () => (await grants()).rows).toEqual([]);
  expect(
    (
      await database.query(
        'SELECT COUNT(*)::integer AS count FROM "EventLog" WHERE "companyId"=$1 AND "subjectId"=$2 AND kind=\'role.deleted\'',
        [companyId, roleId],
      )
    ).rows[0].count,
  ).toBe(1);
  expect(errors).toEqual([]);
});
