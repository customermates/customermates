import { randomUUID } from "node:crypto";

import type { BrowserContext, Page, Request } from "@playwright/test";
import type { Client } from "pg";

import englishMessages from "../../i18n/locales/en.json" with { type: "json" };
import { WORKSPACE_HEADER } from "../../core/navigation/workspace-paths";
import { presetId } from "../../features/records/crm-preset";
import {
  GERMAN_CONSULTANTS_COMPANY_ID,
  GERMAN_CONSULTANTS_SLUG,
  TEAM_WORKSPACE_COMPANY_ID,
  TEAM_WORKSPACE_SLUG,
  appPath,
  appUrlPattern,
} from "./app-paths";
import { expectNotFoundDocuments } from "./browser-diagnostics";
import { test as seededTest } from "./demo-seed";
import { collectPageErrors, expect, test } from "./fixtures";
import { openSidebar } from "./sidebar";
import { addBrowserWorkspace } from "./workspace";
import { addOrganization } from "./workspace-membership";
import { activeWorkspaceOf, e2eAppMode, expectCurrentWorkspace, openWorkspaceSwitcher } from "./workspace-switching";

test.skip(e2eAppMode() === "demo", "Demo mode signs every visitor in as the shared demo account");

const NOT_FOUND = englishMessages.NotFoundPage.title;

function organizationList(slug: string, companyId: string) {
  return appPath(slug, `/records/${presetId(companyId, "organization")}`);
}

async function workspaceName(database: Client, companyId: string) {
  const { rows } = await database.query<{ name: string }>('SELECT name FROM "Company" WHERE id=$1', [companyId]);
  if (!rows[0]) throw new Error("The seeded workspace is missing");
  return rows[0].name;
}

async function organizationsNamed(database: Client, name: string) {
  const { rows } = await database.query<{ companyId: string; recordId: string }>(
    'SELECT "companyId","recordId" FROM "RecordValue" WHERE "textValue"=$1 ORDER BY "companyId"',
    [name],
  );
  return rows;
}

async function removeRecordsNamed(database: Client, names: string[]) {
  const { rows } = await database.query<{ companyId: string; recordId: string }>(
    'SELECT DISTINCT "companyId","recordId" FROM "RecordValue" WHERE "textValue"=ANY($1::text[])',
    [names],
  );
  for (const { companyId, recordId } of rows) {
    await database.query('DELETE FROM "EventLog" WHERE "companyId"=$1 AND "subjectId"=$2', [companyId, recordId]);
    await database.query('DELETE FROM "CrmRecord" WHERE "companyId"=$1 AND id=$2', [companyId, recordId]);
  }
}

function recordServerActions(page: Page) {
  const paths: string[] = [];
  page.on("request", (request: Request) => {
    if (request.method() === "POST" && request.headers()["next-action"]) paths.push(new URL(request.url()).pathname);
  });
  return paths;
}

async function forgeWorkspaceHeader(context: BrowserContext, slug: string) {
  const bodies: string[] = [];
  await context.route(
    (url) => ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname),
    async (route) => {
      const request = route.request();
      const headers = { ...request.headers(), [WORKSPACE_HEADER]: slug };
      if (!request.headers()["rsc"]) return route.continue({ headers });
      const response = await route.fetch({ headers }).catch(() => null);
      if (!response) return route.abort().catch(() => undefined);
      const body = await response.text();
      bodies.push(body);
      await route.fulfill({ response, body });
    },
  );
  return bodies;
}

seededTest.describe("one login in two tabs on two seeded workspaces", () => {
  seededTest.skip(e2eAppMode() === "demo", "Demo mode signs every visitor in as the shared demo account");

  seededTest(
    "each tab works in the workspace of its URL, also after the other tab switched and was used last",
    async ({ context, page, database, errors }) => {
      seededTest.setTimeout(240_000);
      const northwind = await workspaceName(database, TEAM_WORKSPACE_COMPANY_ID);
      const bergmann = await workspaceName(database, GERMAN_CONSULTANTS_COMPANY_ID);
      const suffix = randomUUID().slice(0, 8);
      const fromTeamTab = `Tab A Hafenkontor ${suffix}`;
      const fromConsultantsTab = `Tab B Steuerkanzlei ${suffix}`;
      const tabA = page;
      const tabB = await context.newPage();
      const tabBErrors = collectPageErrors(tabB);
      const tabAActions = recordServerActions(tabA);
      const tabBActions = recordServerActions(tabB);
      const bergmannList = organizationList(GERMAN_CONSULTANTS_SLUG, GERMAN_CONSULTANTS_COMPANY_ID);
      const northwindList = organizationList(TEAM_WORKSPACE_SLUG, TEAM_WORKSPACE_COMPANY_ID);
      try {
        await tabA.goto(appPath(GERMAN_CONSULTANTS_SLUG, "/dashboard"));
        await expectCurrentWorkspace(tabA, bergmann);
        await tabB.goto(bergmannList);
        await expectCurrentWorkspace(tabB, bergmann);

        const menu = await openWorkspaceSwitcher(tabA);
        await menu.locator(`[data-workspace-id="${TEAM_WORKSPACE_COMPANY_ID}"]`).click();
        await expect(tabA).toHaveURL(appUrlPattern(TEAM_WORKSPACE_SLUG, "/dashboard$"));
        await expectCurrentWorkspace(tabA, northwind);
        await expect(tabB).toHaveURL(
          appUrlPattern(
            GERMAN_CONSULTANTS_SLUG,
            `/records/${presetId(GERMAN_CONSULTANTS_COMPANY_ID, "organization")}$`,
          ),
        );
        await tabB.reload();
        await expect(tabB).toHaveURL(new RegExp(`${bergmannList}$`));
        await expectCurrentWorkspace(tabB, bergmann);

        await tabA.goto(northwindList);
        await tabB.reload();
        await expectCurrentWorkspace(tabB, bergmann);
        await addOrganization(tabA, fromTeamTab);
        expect(await organizationsNamed(database, fromTeamTab)).toEqual([
          expect.objectContaining({ companyId: TEAM_WORKSPACE_COMPANY_ID }),
        ]);

        await tabA.reload();
        await expectCurrentWorkspace(tabA, northwind);
        await addOrganization(tabB, fromConsultantsTab);
        expect(await organizationsNamed(database, fromConsultantsTab)).toEqual([
          expect.objectContaining({ companyId: GERMAN_CONSULTANTS_COMPANY_ID }),
        ]);

        await tabA.reload();
        await expect(tabA.getByText(fromTeamTab, { exact: true }).first()).toBeVisible();
        await expect(tabA.getByText(fromConsultantsTab, { exact: true })).toHaveCount(0);
        await tabB.reload();
        await expect(tabB.getByText(fromConsultantsTab, { exact: true }).first()).toBeVisible();
        await expect(tabB.getByText(fromTeamTab, { exact: true })).toHaveCount(0);

        expect(tabAActions.length).toBeGreaterThan(0);
        expect(tabBActions.length).toBeGreaterThan(0);
        expect(tabBActions.filter((path) => !path.startsWith(appPath(GERMAN_CONSULTANTS_SLUG, "/")))).toEqual([]);
        expect(
          tabAActions.filter(
            (path) =>
              !path.startsWith(appPath(TEAM_WORKSPACE_SLUG, "/")) &&
              !path.startsWith(appPath(GERMAN_CONSULTANTS_SLUG, "/")),
          ),
        ).toEqual([]);
        expect(errors).toEqual([]);
        expect(tabBErrors).toEqual([]);
      } finally {
        await tabB.close();
        await removeRecordsNamed(database, [fromTeamTab, fromConsultantsTab]);
      }
    },
  );
});

test("a workspace slug the login is not a member of is not found and does not fall back", async ({
  page,
  workspace,
}) => {
  const errors = collectPageErrors(page);
  expectNotFoundDocuments(page);
  for (const slug of [TEAM_WORKSPACE_SLUG, GERMAN_CONSULTANTS_SLUG, `missing-${randomUUID().slice(0, 8)}`]) {
    const response = await page.goto(appPath(slug, "/dashboard"));
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: NOT_FOUND, exact: true })).toBeVisible();
    await expect(page).toHaveURL(appUrlPattern(slug, "/dashboard$"));
  }
  await page.goto(appPath(workspace.slug, "/dashboard"));
  await expectCurrentWorkspace(page, "Browser workspace");
  expect(errors).toEqual([]);
});

test("a forged workspace request header never selects another workspace", async ({
  context,
  page,
  database,
  workspace,
}) => {
  const errors = collectPageErrors(page);
  const name = `Forged target ${randomUUID().slice(0, 8)}`;
  const second = await addBrowserWorkspace(database, workspace, name);
  const created = `Forged header probe ${randomUUID().slice(0, 8)}`;
  await forgeWorkspaceHeader(context, second.slug);

  await page.goto(appPath(workspace.slug, "/dashboard"));
  await expectCurrentWorkspace(page, "Browser workspace");
  await page.goto("/en/dashboard");
  await expect(page).toHaveURL(appUrlPattern(workspace.slug, "/dashboard$"));
  await expectCurrentWorkspace(page, "Browser workspace");

  await page.goto(organizationList(workspace.slug, workspace.companyId));
  await addOrganization(page, created);
  expect(await organizationsNamed(database, created)).toEqual([
    expect.objectContaining({ companyId: workspace.companyId }),
  ]);
  const response = await page.request.post("/api/v1/model/read", {
    data: {},
    headers: { [WORKSPACE_HEADER]: second.slug },
  });
  expect(response.status()).toBe(200);
  const model = (await response.json()) as { types: Array<{ id: string }> };
  const typeIds = model.types.map((type) => type.id);
  expect(typeIds).toContain(presetId(workspace.companyId, "organization"));
  expect(typeIds).not.toContain(presetId(second.companyId, "organization"));
  expect((await activeWorkspaceOf(database, workspace)).lastUsed).toBe(workspace.companyId);
  expect(errors).toEqual([]);
});

test("after an admin changes the slug the old URL is not found and the new one opens the workspace", async ({
  page,
  database,
  workspace,
}) => {
  const errors = collectPageErrors(page);
  expectNotFoundDocuments(page);
  const renamed = `renamed-${randomUUID().slice(0, 8)}`;
  await page.goto(appPath(workspace.slug, "/settings/general"));
  const slug = page.locator("#settings-general-slug");
  await expect(slug).toHaveValue(workspace.slug);
  const unsavedChanges = page.locator("[data-slot='unsaved-changes-bar']");
  await expect(async () => {
    await slug.fill(renamed);
    await expect(unsavedChanges).toBeVisible({ timeout: 2_000 });
  }).toPass();
  await page.locator("#settings-general-save").click();
  await expect(page).toHaveURL(appUrlPattern(renamed, "/settings/general$"));
  await expect(page.locator("#settings-general-slug")).toHaveValue(renamed);
  const stored = await database.query<{ slug: string }>('SELECT slug FROM "Company" WHERE id=$1', [
    workspace.companyId,
  ]);
  expect(stored.rows[0]?.slug).toBe(renamed);

  await page.waitForLoadState("networkidle");
  const old = await page.goto(appPath(workspace.slug, "/dashboard"));
  expect(old?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: NOT_FOUND, exact: true })).toBeVisible();

  await page.goto(organizationList(renamed, workspace.companyId));
  await expect(page.getByText("Example organization", { exact: true }).first()).toBeVisible();
  await expectCurrentWorkspace(page, "Browser workspace");
  expect(errors).toEqual([]);
});

test("the generic dashboard entry opens the workspace used last", async ({ page, database, workspace }) => {
  const errors = collectPageErrors(page);
  const second = await addBrowserWorkspace(database, workspace, "Last used workspace");

  await page.goto(appPath(second.slug, "/dashboard"));
  await expectCurrentWorkspace(page, "Last used workspace");
  await expect.poll(async () => (await activeWorkspaceOf(database, workspace)).lastUsed).toBe(second.companyId);
  await page.goto("/en/dashboard");
  await expect(page).toHaveURL(appUrlPattern(second.slug, "/dashboard$"));
  await expectCurrentWorkspace(page, "Last used workspace");

  await page.goto(appPath(workspace.slug, "/settings/profile"));
  await expect.poll(async () => (await activeWorkspaceOf(database, workspace)).lastUsed).toBe(workspace.companyId);
  await page.waitForLoadState("networkidle");
  await page.goto("/en/dashboard");
  await expect(page).toHaveURL(appUrlPattern(workspace.slug, "/dashboard$"));
  await expectCurrentWorkspace(page, "Browser workspace");
  expect(errors).toEqual([]);
});

test("prefetched and followed links of one workspace never carry another workspace's data", async ({
  context,
  page,
  database,
  workspace,
}) => {
  const errors = collectPageErrors(page);
  const second = await addBrowserWorkspace(database, workspace, "Prefetch target");
  const probe = `Leak probe ${randomUUID().slice(0, 8)}`;
  const renamed = await database.query(
    'UPDATE "RecordValue" SET "textValue"=$3 WHERE "companyId"=$1 AND "fieldId"=$2',
    [second.companyId, presetId(second.companyId, "organization.name"), probe],
  );
  expect(renamed.rowCount).toBe(1);

  await page.goto(appPath(second.slug, "/dashboard"));
  await expectCurrentWorkspace(page, "Prefetch target");
  const bodies = await forgeWorkspaceHeader(context, second.slug);
  await page.goto(appPath(workspace.slug, "/dashboard"));
  await expectCurrentWorkspace(page, "Browser workspace");
  await openSidebar(page);
  const list = page.locator(`a[href="${organizationList(workspace.slug, workspace.companyId)}"]`).first();
  await expect(list).toBeVisible();
  await list.hover();
  await list.click();

  await expect(page).toHaveURL(new RegExp(`${organizationList(workspace.slug, workspace.companyId)}$`));
  await expect(page.getByText("Example organization", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(probe, { exact: true })).toHaveCount(0);
  await expectCurrentWorkspace(page, "Browser workspace");
  expect(bodies.length).toBeGreaterThan(0);
  expect(bodies.filter((body) => body.includes(probe))).toEqual([]);
  expect(errors).toEqual([]);
});
