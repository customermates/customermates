import { randomUUID } from "node:crypto";
import { test, expect } from "./fixtures";

test("configures a role for a new type, preserves granular rights after rename and deletes the unused role", async ({
  page,
  database,
  companyId,
}, testInfo) => {
  test.setTimeout(240000);
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    if (error.message !== "ResizeObserver loop completed with undelivered notifications.") errors.push(error.message);
  });
  await page.goto("/en/company/data-model");
  await page.getByRole("button", { name: "Create list", exact: true }).click();
  const creation = page.getByRole("dialog");
  await creation.getByRole("textbox", { name: "Name", exact: false }).first().fill("Projects");
  await creation.getByRole("button", { name: "Create list", exact: true }).click();
  await expect(page).toHaveURL(/\/en\/records\/[a-f0-9-]+$/);
  const typeId = new URL(page.url()).pathname.split("/").at(-1);
  expect(typeId).toBeTruthy();
  await page.goto("/en/company/roles");
  await page.locator("#company-roles-add").click();
  const role = page.getByRole("dialog", { name: "Role", exact: true });
  await role.getByRole("textbox", { name: "Name", exact: false }).fill("Project coordinators");
  await role.getByRole("textbox", { name: "Description", exact: false }).fill("Create and read assigned projects");
  const projectGrant = role.locator(`[data-record-permission="${typeId}"]`);
  await expect(projectGrant.getByRole("radio", { name: "None", exact: true })).toBeChecked();
  await projectGrant.getByRole("radio", { name: "Assigned", exact: true }).check();
  await projectGrant.getByRole("checkbox", { name: "Create", exact: true }).check();
  await role
    .getByRole("radiogroup", { name: "Data model — Manage", exact: true })
    .getByRole("radio", { name: "Yes", exact: true })
    .check();
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
  await page.reload();
  await page.getByRole("button", { name: "Project coordinators", exact: true }).click();
  await expect(projectGrant.getByRole("checkbox", { name: "Create", exact: true })).toBeChecked();
  await expect(projectGrant.getByRole("checkbox", { name: "Edit", exact: true })).not.toBeChecked();
  await expect(projectGrant.getByRole("checkbox", { name: "Delete", exact: true })).not.toBeChecked();
  const beforeRename = await page.request.post("/api/v2/roles/read", { data: { id: roleId } });
  expect(beforeRename.ok()).toBe(true);
  const before = await beforeRename.json();
  await page.keyboard.press("Escape");
  await expect(role).not.toBeVisible();
  await page.goto(`/en/company/data-model?typeId=${typeId}`);
  await page.getByRole("button", { name: "Type settings", exact: true }).click();
  const settings = page.getByRole("dialog");
  await settings.locator("#pluralName").fill("Initiatives");
  await settings.getByRole("button", { name: "Preview changes", exact: true }).click();
  await expect(settings.getByRole("status")).toContainText("Ready to apply");
  await settings.getByRole("button", { name: "Apply changes", exact: true }).click();
  await expect(settings).not.toBeVisible();
  const stale = await page.request.post("/api/v2/roles/delete", {
    data: { id: roleId, expectedRevision: before.schemaRevision, idempotencyKey: randomUUID() },
  });
  expect(stale.status()).toBe(409);
  expect((await grants()).rows).toEqual([{ typeId, actions: ["create", "readOwn"] }]);
  await page.goto("/en/company/roles");
  await page.getByRole("button", { name: "Project coordinators", exact: true }).click();
  await expect(role).toBeVisible();
  await projectGrant.scrollIntoViewIfNeeded();
  await expect(projectGrant.getByText("Initiatives", { exact: true })).toBeVisible();
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
        'SELECT COUNT(*)::integer AS count FROM "AuditLog" WHERE "companyId"=$1 AND "entityId"=$2 AND event=\'role.deleted\'',
        [companyId, roleId],
      )
    ).rows[0].count,
  ).toBe(1);
  expect(errors).toEqual([]);
});
