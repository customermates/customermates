import { createHmac, randomBytes, randomUUID } from "node:crypto";

import type { Browser, Locator, Page, TestInfo } from "@playwright/test";
import type { Client } from "pg";
import type { BrowserWorkspace } from "./workspace";

import { resolveAppMode } from "../../core/config/environment";
import { BrowserDiagnostics, collectPageErrors } from "./browser-diagnostics";
import { expect } from "./fixtures";
import { localE2eEnvironment } from "./local-environment";
import { invokesServerAction, serverActionIds } from "./server-actions";
import { openMenu, openSidebar } from "./sidebar";
import { rememberWorkspaceSlug } from "./app-paths";

type Membership = { companyId: string; userId: string };
type MembershipStatus = "active" | "inactive" | "pendingAuthorization";

const WORKSPACE_ACTIONS = "app/[locale]/(protected)/w/[workspace]/settings/(account)/workspaces/actions.ts";

export function e2eAppMode() {
  return resolveAppMode(process.env);
}

export function workspaceListRefreshed(page: Page) {
  const listed = serverActionIds(WORKSPACE_ACTIONS, "listMyWorkspacesAction");
  return page.waitForResponse((response) => invokesServerAction(response.request(), listed));
}

async function openSwitcher(page: Page, ready?: readonly string[]) {
  const refreshed = workspaceListRefreshed(page);
  const menu = await openMenu(page, "#nav-workspace-menu", ready);
  await refreshed;
  return menu;
}

export function openWorkspaceSwitcher(page: Page) {
  return openSwitcher(page);
}

export function openBlockedPageSwitcher(page: Page) {
  return openSwitcher(page, ["sidebar-trigger"]);
}

export async function switchFromBlockedPage(page: Page, companyId: string) {
  const menu = await openBlockedPageSwitcher(page);
  await menu.locator(`[data-workspace-id="${companyId}"]`).click();
}

export async function expectHydrated(locator: Locator) {
  await expect
    .poll(() => locator.evaluate((element) => Object.keys(element).some((key) => key.startsWith("__reactProps"))))
    .toBe(true);
}

export async function clickHydrated(locator: Locator) {
  await expectHydrated(locator);
  await locator.click();
}

export function switcherWorkspaces(menu: Locator) {
  return menu.locator("[data-workspace-id]");
}

export async function expectCurrentWorkspace(page: Page, name: string) {
  await openSidebar(page);
  await expect(page.locator("#nav-workspace-menu")).toHaveAttribute("aria-label", `${name}, Workspace menu`);
}

export async function activeWorkspaceOf(database: Client, login: BrowserWorkspace) {
  const authUser = await database.query<{ companyId: string | null }>(
    'SELECT "companyId" FROM "AuthUser" WHERE id=$1',
    [login.authUserId],
  );
  return { lastUsed: authUser.rows[0]?.companyId ?? null };
}

export async function setActiveWorkspace(database: Client, login: BrowserWorkspace, companyId: string) {
  await database.query('UPDATE "AuthSession" SET "activeCompanyId"=$2 WHERE "userId"=$1', [
    login.authUserId,
    companyId,
  ]);
  await database.query('UPDATE "AuthUser" SET "companyId"=$2 WHERE id=$1', [login.authUserId, companyId]);
}

export async function setMembershipStatus(database: Client, membership: Membership, status: MembershipStatus) {
  const updated = await database.query('UPDATE "User" SET status=$3 WHERE id=$1 AND "companyId"=$2', [
    membership.userId,
    membership.companyId,
    status,
  ]);
  if (updated.rowCount !== 1) throw new Error("The membership to change is missing");
}

export async function addAdministrator(database: Client, companyId: string, email: string) {
  const role = await database.query<{ id: string }>(
    'SELECT id FROM "UserRole" WHERE "companyId"=$1 AND "isSystemRole"=true ORDER BY "createdAt" LIMIT 1',
    [companyId],
  );
  const userId = randomUUID();
  await database.query(
    'INSERT INTO "User" (id,"companyId","roleId",email,"firstName","lastName",status,"agreeToTerms","onboardingWizardCompletedAt","displayLanguage","formattingLocale","updatedAt") VALUES ($1,$2,$3,$4,\'Clara\',\'Admin\',\'active\',true,NOW(),\'en\',\'en\',NOW())',
    [userId, companyId, role.rows[0].id, email],
  );
  return userId;
}

export async function giveMemberRole(database: Client, membership: Membership, name: string) {
  const roleId = randomUUID();
  await database.query('INSERT INTO "UserRole" (id,"companyId",name,"updatedAt") VALUES ($1,$2,$3,NOW())', [
    roleId,
    membership.companyId,
    name,
  ]);
  await database.query('UPDATE "User" SET "roleId"=$3 WHERE id=$1 AND "companyId"=$2', [
    membership.userId,
    membership.companyId,
    roleId,
  ]);
  return roleId;
}

export async function signInLogin(browser: Browser, database: Client, login: BrowserWorkspace, testInfo: TestInfo) {
  const { baseUrl } = localE2eEnvironment();
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("A local authentication secret is required");
  const sessionId = randomUUID();
  const token = randomBytes(32).toString("hex");
  await database.query(
    'INSERT INTO "AuthSession" (id,token,"userId","expiresAt","createdAt","updatedAt") VALUES ($1,$2,$3,NOW()+interval \'1 hour\',NOW(),NOW())',
    [sessionId, token, login.authUserId],
  );
  const context = await browser.newContext({
    baseURL: baseUrl,
    viewport: testInfo.project.use.viewport,
    isMobile: testInfo.project.use.isMobile,
    hasTouch: testInfo.project.use.hasTouch,
    userAgent: testInfo.project.use.userAgent,
    locale: "en-GB",
    reducedMotion: "reduce",
  });
  BrowserDiagnostics.of(testInfo).watch(context);
  rememberWorkspaceSlug(context, login.slug);
  await context.addCookies([
    {
      name: "app.session_token",
      value: encodeURIComponent(`${token}.${createHmac("sha256", secret).update(token).digest("base64")}`),
      url: baseUrl,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  await context.route(
    (url) => !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) && !["data:", "blob:"].includes(url.protocol),
    (route) => route.abort("blockedbyclient"),
  );
  const page = await context.newPage();
  return {
    page,
    errors: collectPageErrors(page),
    close: async () => {
      if (!page.isClosed()) await page.unrouteAll({ behavior: "wait" });
      await context.close();
      await database.query('DELETE FROM "AuthSession" WHERE id=$1', [sessionId]);
    },
  };
}
