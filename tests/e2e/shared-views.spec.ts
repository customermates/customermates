import type { Page } from "@playwright/test";
import type { UpsertRoleData } from "../../features/role/role-management.schema";
import type { RecordMutation } from "../../features/records/record-query.schema";

import { randomUUID } from "node:crypto";

import englishMessages from "../../i18n/locales/en.json" with { type: "json" };
import { RecordOperationResultSchema } from "../../features/records/record-query.schema";
import { recordInvariant } from "../../features/records/record-invariant";
import { expect, test, collectPageErrors } from "./fixtures";
import { postOk } from "./api";
import { createView, openShareDialog, openViewMenu, rail, readModel, saveRole, teammate } from "./view-sharing-helpers";
import { companyPath } from "./app-paths";
import { applyPaletteSearch, clearPaletteSearch } from "./filter-palette";

const share = englishMessages.DataView.share;
const views = englishMessages.DataView.views;
const OWNER_NAME = "Browser Administrator";

async function createRecord(page: Page, mutation: Extract<RecordMutation, { action: "create" }>) {
  const model = await readModel(page);
  const result = RecordOperationResultSchema.parse(
    await postOk(page, "/api/v1/records/mutate", {
      expectedRevision: model.revision,
      idempotencyKey: randomUUID(),
      mutation,
    }),
  );
  if (result.status !== "completed") throw new Error("The synthetic record mutation must complete synchronously");
}

test("shares a list view with one role live, keeps each teammate's own record access and stops on request", async ({
  page,
  browser,
  database,
  companyId,
  workspace,
}, testInfo) => {
  test.setTimeout(300000);
  const errors = collectPageErrors(page);
  let model = await readModel(page);
  await postOk(page, "/api/v1/model/apply", {
    expectedRevision: model.revision,
    idempotencyKey: randomUUID(),
    operations: [
      {
        operation: "createType",
        reference: "$projects",
        label: "Project",
        pluralLabel: "Projects",
        description: "Shared view fixture",
        icon: "folder",
        embedded: false,
        accessPresetId: null,
      },
    ],
  });
  model = await readModel(page);
  const type = model.types.find((candidate) => candidate.pluralLabel === "Projects");
  if (!type) throw new Error("The synthetic Projects type is missing");
  const readers = await saveRole(page, {
    name: "Assigned project readers",
    description: "Read assigned projects only",
    permissions: [{ resource: "company", actions: [] }],
    recordGrants: [{ typeId: type.id, actions: ["readOwn"] as UpsertRoleData["recordGrants"][number]["actions"] }],
  });
  const others = await saveRole(page, {
    name: "Other project readers",
    description: "Read assigned projects only, not chosen for the view",
    permissions: [{ resource: "company", actions: [] }],
    recordGrants: [{ typeId: type.id, actions: ["readOwn"] as UpsertRoleData["recordGrants"][number]["actions"] }],
  });
  const member = await teammate(browser, database, companyId, readers.role.id, testInfo);
  const outsider = await teammate(browser, database, companyId, others.role.id, testInfo);
  try {
    const primary = recordInvariant(type.primaryFieldId);
    await createRecord(page, {
      action: "create",
      typeId: type.id,
      fields: [{ fieldId: primary, value: { kind: "text", value: "Assigned rollout" } }],
      assignedUserIds: [member.userId],
    });
    await createRecord(page, {
      action: "create",
      typeId: type.id,
      fields: [{ fieldId: primary, value: { kind: "text", value: "Owner-only budget" } }],
      assignedUserIds: [workspace.userId],
    });

    const listPath = companyPath(companyId, `/records/${type.id}`);
    await page.goto(listPath);
    await expect(page.getByText("Owner-only budget", { exact: true })).toBeVisible();
    const viewId = await createView(page, "Delivery board");

    const dialog = await openShareDialog(page);
    await expect(dialog.getByRole("heading", { name: share.title.replace("{name}", "Delivery board") })).toBeVisible();
    await expect(dialog.locator("#share-scope-private")).toBeChecked();
    await dialog.locator("#share-scope-roles").check();
    await expect(dialog.locator("#share-view-save")).toBeDisabled();
    await dialog.getByRole("checkbox", { name: "Assigned project readers", exact: true }).click();
    const link = (await dialog.locator("#share-view-link").getAttribute("data-value")) ?? "";
    expect(new URL(link).pathname).toBe(listPath);
    expect(new URL(link).searchParams.get("view")).toBe(viewId);
    expect(new URL(link).searchParams.has("viewShare")).toBe(false);
    await dialog.locator("#share-view-save").click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByText(share.savedRoles, { exact: true })).toBeVisible();
    const ownChip = rail(page).getByRole("link", { name: "Delivery board", exact: true });
    await expect(ownChip).toHaveAttribute("data-view-shared", "mine");
    const stored = await database.query(
      'SELECT v.visibility::text AS visibility, array_agg(s."roleId") AS roles FROM "DataView" v JOIN "DataViewRoleShare" s ON s."viewId"=v.id WHERE v.id=$1 GROUP BY v.visibility',
      [viewId],
    );
    expect(stored.rows).toEqual([{ visibility: "roles", roles: [readers.role.id] }]);

    await member.page.goto(new URL(link).pathname + new URL(link).search);
    const sharedChip = rail(member.page).getByRole("link", { name: "Delivery board", exact: true });
    await expect(sharedChip).toHaveAttribute("aria-current", "page");
    await expect(sharedChip).toHaveAttribute("data-view-shared", "others");
    await expect(member.page.getByText("Assigned rollout", { exact: true })).toBeVisible();
    await expect(member.page.getByText("Owner-only budget", { exact: true })).toHaveCount(0);
    await expect(member.page.locator("#records-add")).toHaveCount(0);
    await expect(member.page.locator("#records-filter")).toBeEnabled();
    await applyPaletteSearch(member.page, "records-filter", "zz-no-such-rollout");
    await expect(member.page.getByText("Assigned rollout", { exact: true })).toHaveCount(0);
    await clearPaletteSearch(member.page, "records-filter");
    await expect(member.page.getByText("Assigned rollout", { exact: true })).toBeVisible();

    await outsider.page.goto(new URL(link).pathname + new URL(link).search);
    await expect(rail(outsider.page).locator("#global-data-views-all")).toHaveAttribute("aria-current", "page");
    await expect(rail(outsider.page).getByRole("link", { name: "Delivery board", exact: true })).toHaveCount(0);

    const memberMenu = await openViewMenu(member.page);
    await expect(memberMenu.getByText(share.sharedBy.replace("{name}", OWNER_NAME), { exact: true })).toBeVisible();
    await expect(memberMenu.getByRole("menuitem", { name: views.editTitle })).toHaveCount(0);
    await expect(memberMenu.getByRole("menuitem", { name: views.delete })).toHaveCount(0);
    await expect(memberMenu.getByRole("menuitem", { name: share.menuItem })).toHaveCount(0);
    await expect(memberMenu.getByRole("menuitem", { name: share.hide, exact: true })).toBeVisible();
    await member.page.keyboard.press("Escape");

    await page.goto(`${listPath}?view=${viewId}`);
    const renamed = await openViewMenu(page);
    await renamed.getByRole("menuitem", { name: views.editTitle, exact: true }).click();
    await page.getByPlaceholder(views.namePlaceholder).fill("Delivery board Q4");
    await page.getByRole("button", { name: englishMessages.Common.actions.save, exact: true }).click();
    await expect(rail(page).getByRole("link", { name: "Delivery board Q4", exact: true })).toBeVisible();
    await member.page.reload();
    await expect(rail(member.page).getByRole("link", { name: "Delivery board Q4", exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );

    const hideMenu = await openViewMenu(member.page);
    await hideMenu.getByRole("menuitem", { name: share.hide, exact: true }).click();
    await expect(member.page.getByText(share.hidden, { exact: true })).toBeVisible();
    await expect(rail(member.page).getByRole("link", { name: "Delivery board Q4", exact: true })).toHaveCount(0);
    await database.query('DELETE FROM "DataViewHidden" WHERE "viewId"=$1', [viewId]);

    const everyoneDialog = await openShareDialog(page);
    await expect(everyoneDialog.locator("#share-scope-roles")).toBeChecked();
    await everyoneDialog.locator("#share-scope-workspace").check();
    await everyoneDialog.locator("#share-view-save").click();
    await expect(page.getByText(share.savedWorkspace, { exact: true })).toBeVisible();
    await outsider.page.goto(new URL(link).pathname + new URL(link).search);
    const outsiderChip = rail(outsider.page).getByRole("link", { name: "Delivery board Q4", exact: true });
    await expect(outsiderChip).toHaveAttribute("aria-current", "page");
    await expect(outsiderChip).toHaveAttribute("data-view-shared", "others");
    await expect(outsider.page.getByText("Assigned rollout", { exact: true })).toHaveCount(0);
    await expect(outsider.page.getByText("Owner-only budget", { exact: true })).toHaveCount(0);

    const privateDialog = await openShareDialog(page);
    await expect(privateDialog.locator("#share-scope-workspace")).toBeChecked();
    await privateDialog.locator("#share-scope-private").check();
    await privateDialog.locator("#share-view-save").click();
    await expect(page.getByText(share.savedPrivate, { exact: true })).toBeVisible();
    await member.page.goto(new URL(link).pathname + new URL(link).search);
    await expect(rail(member.page).locator("#global-data-views-all")).toHaveAttribute("aria-current", "page");
    await expect(rail(member.page).getByRole("link", { name: "Delivery board Q4", exact: true })).toHaveCount(0);
    await expect(member.page.getByText("Owner-only budget", { exact: true })).toHaveCount(0);
    await outsider.page.reload();
    await expect(rail(outsider.page).getByRole("link", { name: "Delivery board Q4", exact: true })).toHaveCount(0);

    expect(errors).toEqual([]);
    expect(member.errors).toEqual([]);
    expect(outsider.errors).toEqual([]);
  } finally {
    await member.close();
    await outsider.close();
  }
});

test("shares a dashboard view with one role, then everyone, read-only for teammates who can duplicate it with its widgets", async ({
  page,
  browser,
  database,
  companyId,
}, testInfo) => {
  test.setTimeout(300000);
  const errors = collectPageErrors(page);
  const roles = await database.query(
    'SELECT id, name FROM "UserRole" WHERE "companyId"=$1 AND "isSystemRole"=true ORDER BY name LIMIT 1',
    [companyId],
  );
  const guests = await saveRole(page, {
    name: "Dashboard guests",
    description: "Not chosen for the dashboard view",
    permissions: [{ resource: "company", actions: [] }],
    recordGrants: [],
  });
  const member = await teammate(browser, database, companyId, roles.rows[0].id, testInfo);
  const outsider = await teammate(browser, database, companyId, guests.role.id, testInfo);
  try {
    const dashboardPath = companyPath(companyId, "/dashboard");
    await page.goto(dashboardPath);
    const viewId = await createView(page, "Team board");
    const dialog = page.getByRole("dialog");
    await page.locator("#dashboard-add-widget").click();
    await dialog.locator("#widget-starter-number").click();
    await dialog.getByRole("textbox", { name: "Name", exact: false }).fill("Shared number");
    await dialog.locator("#widget-modal-save").click();
    await expect(page.getByRole("heading", { name: "Shared number", exact: true })).toBeVisible();

    const ownDuplicate = await openViewMenu(page);
    await ownDuplicate.getByRole("menuitem", { name: views.duplicate, exact: true }).click();
    await page.getByPlaceholder(views.namePlaceholder).fill("Team board backup");
    await page.getByRole("button", { name: englishMessages.Common.actions.save, exact: true }).click();
    await expect(rail(page).getByRole("link", { name: "Team board backup", exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(new URL(page.url()).searchParams.get("view")).not.toBe(viewId);
    await expect(page.getByRole("heading", { name: "Shared number", exact: true })).toBeVisible();
    await expect(page.locator("#dashboard-add-widget")).toBeVisible();
    await page.goto(`${dashboardPath}?view=${viewId}`);
    await expect(rail(page).getByRole("link", { name: "Team board", exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );

    const shareDialog = await openShareDialog(page);
    await expect(shareDialog.getByText(share.descriptionDashboard, { exact: true })).toBeVisible();
    await shareDialog.locator("#share-scope-roles").check();
    await shareDialog.getByRole("checkbox", { name: roles.rows[0].name, exact: true }).click();
    await shareDialog.locator("#share-view-save").click();
    await expect(page.getByText(share.savedRoles, { exact: true })).toBeVisible();
    await outsider.page.goto(`${dashboardPath}?view=${viewId}`);
    await expect(rail(outsider.page).locator("#global-data-views-all")).toHaveAttribute("aria-current", "page");
    await expect(rail(outsider.page).getByRole("link", { name: "Team board", exact: true })).toHaveCount(0);
    await expect(outsider.page.getByRole("heading", { name: "Shared number", exact: true })).toHaveCount(0);

    await member.page.goto(dashboardPath);
    const chip = rail(member.page).getByRole("link", { name: "Team board", exact: true });
    await expect(chip).toBeVisible();
    await chip.click();
    await expect(chip).toHaveAttribute("aria-current", "page");
    await expect(member.page).toHaveURL(new RegExp(`[?&]view=${viewId}`));
    await expect(member.page.getByRole("heading", { name: "Shared number", exact: true })).toBeVisible();
    await expect(member.page.locator("#dashboard-add-widget")).toHaveCount(0);
    await expect(
      member.page.getByRole("button", {
        name: englishMessages.Dashboard.widgetEditor.editTitle.replace("{name}", "Shared number"),
      }),
    ).toHaveCount(0);

    const everyoneDialog = await openShareDialog(page);
    await everyoneDialog.locator("#share-scope-workspace").check();
    await everyoneDialog.locator("#share-view-save").click();
    await expect(page.getByText(share.savedWorkspace, { exact: true })).toBeVisible();
    await outsider.page.goto(`${dashboardPath}?view=${viewId}`);
    const outsiderChip = rail(outsider.page).getByRole("link", { name: "Team board", exact: true });
    await expect(outsiderChip).toHaveAttribute("aria-current", "page");
    await expect(outsiderChip).toHaveAttribute("data-view-shared", "others");
    await expect(outsider.page.getByRole("heading", { name: "Shared number", exact: true })).toBeVisible();
    await expect(outsider.page.locator("#dashboard-add-widget")).toHaveCount(0);

    const duplicateMenu = await openViewMenu(outsider.page);
    await duplicateMenu.getByRole("menuitem", { name: views.duplicate, exact: true }).click();
    const copyName = outsider.page.getByPlaceholder(views.namePlaceholder);
    await expect(copyName).toHaveValue(views.duplicateName.replace("{name}", "Team board"));
    await copyName.fill("My team board");
    await outsider.page.getByRole("button", { name: englishMessages.Common.actions.save, exact: true }).click();
    const copyChip = rail(outsider.page).getByRole("link", { name: "My team board", exact: true });
    await expect(copyChip).toHaveAttribute("aria-current", "page");
    await expect(copyChip).not.toHaveAttribute("data-view-shared", /.+/);
    const copyId = new URL(outsider.page.url()).searchParams.get("view");
    expect(copyId).not.toBe(viewId);
    await expect(outsider.page.getByRole("heading", { name: "Shared number", exact: true })).toBeVisible();
    await expect(
      outsider.page.getByRole("button", {
        name: englishMessages.Dashboard.widgetEditor.editTitle.replace("{name}", "Shared number"),
      }),
    ).toBeVisible();
    const copies = await database.query(
      'SELECT w."userId" FROM "Widget" w WHERE w."viewId"=$1 AND w."deletedAt" IS NULL',
      [copyId],
    );
    expect(copies.rows).toEqual([{ userId: outsider.userId }]);

    const privateDialog = await openShareDialog(page);
    await privateDialog.locator("#share-scope-private").check();
    await privateDialog.locator("#share-view-save").click();
    await expect(page.getByText(share.savedPrivate, { exact: true })).toBeVisible();
    await member.page.goto(`${dashboardPath}?view=${viewId}`);
    await expect(rail(member.page).locator("#global-data-views-all")).toHaveAttribute("aria-current", "page");
    await expect(rail(member.page).getByRole("link", { name: "Team board", exact: true })).toHaveCount(0);
    await expect(member.page.getByRole("heading", { name: "Shared number", exact: true })).toHaveCount(0);
    await outsider.page.goto(`${dashboardPath}?view=${copyId}`);
    await expect(rail(outsider.page).getByRole("link", { name: "Team board", exact: true })).toHaveCount(0);
    await expect(rail(outsider.page).getByRole("link", { name: "My team board", exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(outsider.page.getByRole("heading", { name: "Shared number", exact: true })).toBeVisible();

    expect(errors).toEqual([]);
    expect(member.errors).toEqual([]);
    expect(outsider.errors).toEqual([]);
  } finally {
    await member.close();
    await outsider.close();
  }
});
