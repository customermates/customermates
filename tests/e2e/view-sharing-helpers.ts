import type { Browser, Page, TestInfo } from "@playwright/test";
import type { Client } from "pg";
import type { UpsertRoleData } from "../../features/role/role-management.schema";

import { createHmac, randomBytes, randomUUID } from "node:crypto";

import englishMessages from "../../i18n/locales/en.json" with { type: "json" };
import { RoleApiMutationResultSchema } from "../../features/role/role-management.schema";
import { RecordModelSchema } from "../../features/records/record-model.schema";
import { localE2eEnvironment } from "./local-environment";
import { BrowserDiagnostics } from "./browser-diagnostics";
import { expect, collectPageErrors } from "./fixtures";
import { postOk } from "./api";
import { companySlug, rememberWorkspaceSlug } from "./app-paths";
import { openViewsMenu, openViewsMenuItem } from "./views-menu";

const share = englishMessages.DataView.share;
const views = englishMessages.DataView.views;

/** A browser context with no session at all, as an outsider opening a public link sees the app. */
export async function anonymous(browser: Browser, testInfo: TestInfo) {
  const { baseUrl } = localE2eEnvironment();
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
  await context.route(
    (url) => !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) && !["data:", "blob:"].includes(url.protocol),
    (route) => route.abort("blockedbyclient"),
  );
  const page = await context.newPage();
  return { page, errors: collectPageErrors(page), close: () => context.close() };
}

export async function readModel(page: Page) {
  return RecordModelSchema.parse(await postOk(page, "/api/v1/model/read", {}));
}

export async function saveRole(page: Page, role: Omit<UpsertRoleData, "expectedRevision" | "idempotencyKey">) {
  const model = await readModel(page);
  return RoleApiMutationResultSchema.parse(
    await postOk(page, "/api/v1/roles/save", {
      ...role,
      expectedRevision: model.revision,
      idempotencyKey: randomUUID(),
    }),
  );
}

export async function teammate(
  browser: Browser,
  database: Client,
  companyId: string,
  roleId: string,
  testInfo: TestInfo,
) {
  const { baseUrl } = localE2eEnvironment();
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("A local authentication secret is required");
  const userId = randomUUID();
  const authUserId = randomUUID();
  const email = `teammate-${userId}@example.test`;
  await database.query(
    'INSERT INTO "User" (id,"companyId","roleId",email,"firstName","lastName",status,"agreeToTerms","onboardingWizardCompletedAt","displayLanguage","formattingLocale","updatedAt") VALUES ($1,$2,$3,$4,\'Team\',\'Mate\',\'active\',true,NOW(),\'en\',\'en\',NOW())',
    [userId, companyId, roleId, email],
  );
  await database.query(
    'INSERT INTO "AuthUser" (id,"companyId",email,name,"emailVerified","updatedAt") VALUES ($1,$2,$3,\'Team Mate\',true,NOW())',
    [authUserId, companyId, email],
  );
  const token = randomBytes(32).toString("hex");
  await database.query(
    'INSERT INTO "AuthSession" (id,token,"userId","expiresAt","createdAt","updatedAt") VALUES ($1,$2,$3,NOW()+interval \'1 hour\',NOW(),NOW())',
    [randomUUID(), token, authUserId],
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
  rememberWorkspaceSlug(context, companySlug(companyId));
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
  const errors = collectPageErrors(page);
  return {
    page,
    userId,
    errors,
    close: async () => {
      await page.screenshot({ path: testInfo.outputPath(`teammate-${userId}.png`), animations: "disabled" });
      await context.close();
      await database.query('DELETE FROM "AuthUser" WHERE id=$1 AND "companyId"=$2', [authUserId, companyId]);
    },
  };
}

export function rail(page: Page) {
  return page.locator("#global-data-views");
}

export async function createView(page: Page, name: string) {
  const nameInput = page.getByPlaceholder(views.namePlaceholder);
  await expect(async () => {
    if (!(await nameInput.isVisible()))
      await rail(page).getByRole("button", { name: views.createTitle, exact: true }).click();
    await expect(nameInput).toBeVisible({ timeout: 3000 });
  }).toPass({ timeout: 30000 });
  await nameInput.fill(name);
  await page.getByRole("button", { name: englishMessages.Common.actions.save, exact: true }).click();
  await expect(page).toHaveURL(/[?&]view=[0-9a-f-]{36}/);
  return new URL(page.url()).searchParams.get("view") ?? "";
}

export async function openViewMenu(page: Page) {
  return openViewsMenu(page);
}

export async function openShareDialog(page: Page) {
  await openViewsMenuItem(page, share.menuItem);
  const dialog = page.locator("#share-view-dialog");
  await expect(dialog).toBeVisible();
  return dialog;
}
