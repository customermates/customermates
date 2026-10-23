import { randomUUID } from "node:crypto";

import type { Page } from "@playwright/test";

import englishMessages from "../../i18n/locales/en.json" with { type: "json" };
import { presetId } from "../../features/records/crm-preset";
import { postOk } from "./api";
import { appPath, appUrlPattern } from "./app-paths";
import { expectNotFoundDocuments } from "./browser-diagnostics";
import { collectPageErrors, expect, test } from "./fixtures";
import { openSidebar } from "./sidebar";
import { addBrowserWorkspace } from "./workspace";
import {
  activeWorkspaceOf,
  clickHydrated,
  e2eAppMode,
  expectCurrentWorkspace,
  openWorkspaceSwitcher,
  switcherWorkspaces,
} from "./workspace-switching";

test.skip(e2eAppMode() === "demo", "Demo mode signs every visitor in as the shared demo account");

async function createOrganization(page: Page, companyId: string, name: string) {
  const model = await postOk(page, "/api/v1/model/read", {});
  await postOk(page, "/api/v1/records/mutate", {
    expectedRevision: model.revision,
    idempotencyKey: randomUUID(),
    mutation: {
      action: "create",
      typeId: presetId(companyId, "organization"),
      fields: [{ fieldId: presetId(companyId, "organization.name"), value: { kind: "text", value: name } }],
    },
  });
}

test("the switcher lists the login's workspaces and a switch shows only the chosen workspace's records", async ({
  page,
  database,
  workspace,
}, testInfo) => {
  const errors = collectPageErrors(page);
  expectNotFoundDocuments(page);
  const second = await addBrowserWorkspace(database, workspace, "Bergmann Steuern");
  await createOrganization(page, workspace.companyId, "Hansen Logistik");
  const firstList = appPath(workspace.slug, `/records/${presetId(workspace.companyId, "organization")}`);
  const secondList = appPath(second.slug, `/records/${presetId(second.companyId, "organization")}`);
  const firstListInSecond = appPath(second.slug, `/records/${presetId(workspace.companyId, "organization")}`);

  await page.goto(firstList);
  await expect(page.getByRole("link", { name: "Hansen Logistik", exact: true })).toBeVisible();
  const menu = await openWorkspaceSwitcher(page);
  await expect(switcherWorkspaces(menu)).toHaveText([/Browser workspace/, /Bergmann Steuern/]);
  await expect(menu.locator(`[data-workspace-id="${workspace.companyId}"]`)).toHaveAttribute("aria-current", "true");
  await expect(menu.locator(`[data-workspace-id="${second.companyId}"]`)).not.toHaveAttribute("aria-current");
  await expect(menu.getByRole("menuitem", { name: "Create workspace", exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("ws-switcher-open.png") });
  await menu.locator(`[data-workspace-id="${second.companyId}"]`).click();

  await expect(page).toHaveURL(appUrlPattern(second.slug, "/dashboard$"));
  await expectCurrentWorkspace(page, "Bergmann Steuern");
  expect(await activeWorkspaceOf(database, workspace)).toEqual({ lastUsed: second.companyId });
  await page.goto(secondList);
  await expect(page.getByRole("link", { name: "Example organization", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Hansen Logistik", exact: true })).toHaveCount(0);
  const model = await postOk(page, "/api/v1/model/read", {});
  const typeIds = model.types.map((type: { id: string }) => type.id);
  expect(typeIds).toContain(presetId(second.companyId, "organization"));
  expect(typeIds).not.toContain(presetId(workspace.companyId, "organization"));
  await page.goto(firstListInSecond);
  await expect(page.getByRole("heading", { name: englishMessages.NotFoundPage.title, exact: true })).toBeVisible();

  await page.goto(appPath(second.slug, "/settings/workspaces"));
  await expect(page.locator(`li[data-workspace-id="${second.companyId}"]`)).toContainText("Current");
  await clickHydrated(page.getByRole("button", { name: "Switch to Browser workspace", exact: true }));
  await expect(page).toHaveURL(appUrlPattern(workspace.slug, "/dashboard$"));
  await expectCurrentWorkspace(page, "Browser workspace");
  await page.goto(firstList);
  await expect(page.getByRole("link", { name: "Hansen Logistik", exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("the command palette switches to another workspace", async ({ page, database, workspace }) => {
  const errors = collectPageErrors(page);
  const second = await addBrowserWorkspace(database, workspace, "Bergmann Steuern");
  await page.goto(appPath(workspace.slug, `/records/${presetId(workspace.companyId, "organization")}`));
  await openSidebar(page);
  await page.locator("#nav-search").click();
  const dialog = page.getByRole("dialog");
  await page.locator("#global-search-input input").fill("Switch workspace");
  await dialog.getByRole("option").filter({ hasText: "Switch workspace…" }).click();
  const workspaces = dialog.getByRole("option");
  await expect(workspaces).toHaveText([/Bergmann Steuern/]);
  await workspaces.first().click();

  await expect(page).toHaveURL(appUrlPattern(second.slug, "/dashboard$"));
  await expectCurrentWorkspace(page, "Bergmann Steuern");
  expect((await activeWorkspaceOf(database, workspace)).lastUsed).toBe(second.companyId);
  expect(errors).toEqual([]);
});

test("G then W opens the other workspaces in search, which also suggests switching", async ({
  page,
  database,
  workspace,
}, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop keyboard journey");
  const errors = collectPageErrors(page);
  const second = await addBrowserWorkspace(database, workspace, "Bergmann Steuern");
  await page.goto(appPath(workspace.slug, "/dashboard"));
  await openSidebar(page);
  await page.waitForLoadState("networkidle");

  const dialog = page.getByRole("dialog");
  await clickHydrated(page.locator("#nav-search"));
  const suggestion = dialog.getByRole("option").filter({ hasText: "Switch workspace…" });
  await expect(suggestion).toBeVisible();
  await expect(suggestion.locator('[data-shortcut="goWorkspaces"] kbd')).toHaveText(["G", "W"]);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  await page.keyboard.press("?");
  const shortcuts = page.getByRole("dialog", { name: "Keyboard shortcuts" });
  await expect(shortcuts.locator("[data-shortcut-row=goWorkspaces]")).toContainText("Switch workspace");
  await expect(shortcuts.locator("[data-shortcut-row=goWorkspaces] kbd")).toHaveText(["G", "W"]);
  await page.keyboard.press("Escape");
  await expect(shortcuts).toBeHidden();

  await page.keyboard.press("g");
  await page.keyboard.press("w");
  await expect(dialog.getByText("Switch workspace…", { exact: true })).toBeVisible();
  const workspaces = dialog.getByRole("option");
  await expect(workspaces).toHaveText([/Bergmann Steuern/]);
  await workspaces.first().click();

  await expect(page).toHaveURL(appUrlPattern(second.slug, "/dashboard$"));
  await expectCurrentWorkspace(page, "Bergmann Steuern");
  expect((await activeWorkspaceOf(database, workspace)).lastUsed).toBe(second.companyId);
  expect(errors).toEqual([]);
});

test("typing a workspace name in global search offers a switch to each other matching workspace", async ({
  page,
  database,
  workspace,
}) => {
  const errors = collectPageErrors(page);
  const second = await addBrowserWorkspace(database, workspace, "Bergmann Workspace");
  await page.goto(appPath(workspace.slug, `/records/${presetId(workspace.companyId, "organization")}`));
  await openSidebar(page);
  await page.locator("#nav-search").click();
  const dialog = page.getByRole("dialog");
  await page.locator("#global-search-input input").fill("workspace");
  const switchOption = dialog.getByRole("option", { name: "Switch to Bergmann Workspace", exact: true });
  await expect(switchOption).toBeVisible();
  await expect(dialog.getByRole("option", { name: "Switch to Browser workspace", exact: true })).toHaveCount(0);
  await switchOption.click();

  await expect(page).toHaveURL(appUrlPattern(second.slug, "/dashboard$"));
  await expectCurrentWorkspace(page, "Bergmann Workspace");
  expect((await activeWorkspaceOf(database, workspace)).lastUsed).toBe(second.companyId);
  expect(errors).toEqual([]);
});
