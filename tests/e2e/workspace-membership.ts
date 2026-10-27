import { randomBytes, randomUUID } from "node:crypto";

import type { Page, PlaywrightWorkerArgs } from "@playwright/test";
import type { Client } from "pg";
import type { BrowserWorkspace } from "./workspace";

import { WORKSPACE_CHANGED_DIGEST } from "../../core/errors/workspace-changed";
import { CustomErrorCode } from "../../core/validation/validation.types";
import { presetId } from "../../features/records/crm-preset";
import { expect } from "./fixtures";
import { localE2eEnvironment } from "./local-environment";
import { invokesServerAction, serverActionIds } from "./server-actions";
import { createBrowserWorkspace } from "./workspace";
import { clickHydrated, e2eAppMode } from "./workspace-switching";
import { companyPath, pagePath } from "./app-paths";

type Permission = { resource: string; action: string };

export async function nameLogin(database: Client, login: BrowserWorkspace, firstName: string, lastName: string) {
  await database.query(
    'UPDATE "User" SET "firstName"=$2,"lastName"=$3 WHERE email=(SELECT email FROM "AuthUser" WHERE id=$1)',
    [login.authUserId, firstName, lastName],
  );
  await database.query('UPDATE "AuthUser" SET name=$2 WHERE id=$1', [login.authUserId, `${firstName} ${lastName}`]);
}

export async function createNamedLogin(database: Client, workspaceName: string, firstName: string, lastName: string) {
  const login = await createBrowserWorkspace(database, workspaceName);
  await nameLogin(database, login, firstName, lastName);
  return login;
}

export async function loginEmail(database: Client, login: BrowserWorkspace) {
  const result = await database.query<{ email: string }>('SELECT email FROM "AuthUser" WHERE id=$1', [
    login.authUserId,
  ]);
  return result.rows[0].email;
}

export async function addMembership(
  database: Client,
  login: BrowserWorkspace,
  companyId: string,
  access: { admin: true } | { roleName: string; permissions: Permission[] },
) {
  let roleId: string = randomUUID();
  if ("admin" in access) {
    const role = await database.query<{ id: string }>(
      'SELECT id FROM "UserRole" WHERE "companyId"=$1 AND "isSystemRole"=true ORDER BY "createdAt" LIMIT 1',
      [companyId],
    );
    roleId = role.rows[0].id;
  } else {
    await database.query('INSERT INTO "UserRole" (id,"companyId",name,"updatedAt") VALUES ($1,$2,$3,NOW())', [
      roleId,
      companyId,
      access.roleName,
    ]);
    for (const permission of access.permissions)
      await database.query(
        'INSERT INTO "RolePermission" (id,"roleId","companyId",resource,action) VALUES ($1,$2,$3,$4,$5)',
        [randomUUID(), roleId, companyId, permission.resource, permission.action],
      );
  }
  const userId = randomUUID();
  const inserted = await database.query(
    'INSERT INTO "User" (id,"companyId","roleId",email,"firstName","lastName",country,"avatarUrl",theme,"displayLanguage","formattingLocale",status,"agreeToTerms","onboardingWizardCompletedAt","agentCreditActivatedAt","updatedAt") SELECT $1,$2,$3,email,"firstName","lastName",country,"avatarUrl",theme,"displayLanguage","formattingLocale",\'active\',true,NOW(),NOW(),NOW() FROM "User" WHERE id=$4 AND "companyId"=$5',
    [userId, companyId, roleId, login.userId, login.companyId],
  );
  if (inserted.rowCount !== 1) throw new Error("The login to add a membership for is missing");
  return { companyId, userId };
}

export async function inviteToken(database: Client, invitation: { companyId: string; createdById: string }) {
  const token = randomBytes(24).toString("base64url");
  await database.query(
    'INSERT INTO "InviteToken" (id,token,"companyId","createdById","expiresAt","updatedAt") VALUES ($1,$2,$3,$4,NOW()+interval \'7 days\',NOW())',
    [randomUUID(), token, invitation.companyId, invitation.createdById],
  );
  return token;
}

export async function membershipIn(database: Client, companyId: string, email: string) {
  const result = await database.query<{ id: string; status: string; left: boolean }>(
    'SELECT id,status::text,"leftAt" IS NOT NULL AS left FROM "User" WHERE "companyId"=$1 AND email=$2',
    [companyId, email],
  );
  return result.rows[0] ?? null;
}

/** Open requests of this login to join the workspace: the members Settings > Members asks an admin to approve. */
export async function pendingRequestCount(database: Client, companyId: string, email: string) {
  const result = await database.query<{ count: number }>(
    'SELECT COUNT(*)::integer AS count FROM "User" WHERE "companyId"=$1 AND email=$2 AND status=\'pendingAuthorization\' AND "leftAt" IS NULL',
    [companyId, email],
  );
  return result.rows[0].count;
}

/** The workspace menu announces members waiting for approval to those who may approve them. */
export function workspaceMenu(page: Page) {
  return page.locator("#nav-workspace-menu");
}

export function organizationList(companyId: string) {
  return companyPath(companyId, `/records/${presetId(companyId, "organization")}`);
}

export function memberItem(page: Page, name: string) {
  return page.locator("tr[data-row-id], li[data-row-id]").filter({ hasText: name }).first();
}

export async function readInvitationLink(page: Page) {
  await page.goto(pagePath(page, "/settings/members"));
  await clickHydrated(page.locator("#settings-members-add"));
  const dialog = page.getByRole("dialog");
  const link = dialog.locator("#invite-modal-link");
  await expect(link).toHaveValue(/\/invitation\/[^/]+$/);
  const value = await link.inputValue();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  return value;
}

export async function apiKeyRequest(playwright: PlaywrightWorkerArgs["playwright"], key: string) {
  const api = await playwright.request.newContext({
    baseURL: localE2eEnvironment().baseUrl,
    extraHTTPHeaders: { "x-api-key": key },
  });
  try {
    const response = await api.get("/api/v1/users/me");
    const body = (await response.json().catch(() => null)) as { id?: string } | null;
    return { status: response.status(), id: response.ok() ? (body?.id ?? null) : null };
  } finally {
    await api.dispose();
  }
}

export async function addOrganization(page: Page, name: string) {
  await clickHydrated(page.locator("#records-add"));
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Name", exact: false }).first().fill(name);
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
}

function refusesChangedWorkspace(body: string) {
  return body.includes(WORKSPACE_CHANGED_DIGEST) || body.includes(`"${CustomErrorCode.workspaceChanged}"`);
}

/**
 * Records the page's server-action POSTs to `path`. The body is read through a route because Chromium often drops the
 * body of a streamed action response before `response.text()` can fetch it ("No data found for resource").
 */
export async function expectRefusedPageAction(page: Page, path: string) {
  const refusals: Array<{ status: number; workspaceChanged: boolean }> = [];
  await page.route(
    (url) => url.pathname === path,
    async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      const response = await route.fetch().catch(() => null);
      if (!response) return route.abort().catch(() => undefined);
      const body = await response.text();
      refusals.push({ status: response.status(), workspaceChanged: refusesChangedWorkspace(body) });
      await route.fulfill({ response, body });
    },
  );
  return refusals;
}

export function recordUnreadCountPolls(page: Page) {
  const actionIds = serverActionIds("app/[locale]/(protected)/w/[workspace]/inbox/actions.ts", "getUnreadThreadCountAction");
  const sentAt: number[] = [];
  page.on("request", (request) => {
    if (invokesServerAction(request, actionIds)) sentAt.push(Date.now());
  });
  return sentAt;
}

export function recordSentryRequests(page: Page) {
  const requests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/monitoring")) requests.push(request.url());
  });
  return requests;
}

export async function recordToasts(page: Page) {
  await page.addInitScript(() => {
    const toasts: string[] = [];
    Object.assign(window, { recordedToasts: toasts });
    document.addEventListener("DOMContentLoaded", () => {
      new MutationObserver(() => {
        for (const toast of document.querySelectorAll("[data-sonner-toast]")) {
          const entry = `${toast.getAttribute("data-type") ?? "toast"}: ${toast.textContent ?? ""}`;
          if (!toasts.includes(entry)) toasts.push(entry);
        }
      }).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    });
  });
  return () => page.evaluate(() => (window as Window & { recordedToasts?: string[] }).recordedToasts ?? []);
}

export async function joinFromInvitation(page: Page) {
  if (e2eAppMode() === "cloud") await clickHydrated(page.locator("#workspace-invitation-terms"));
  await clickHydrated(page.getByRole("button", { name: "Join workspace", exact: true }));
}
