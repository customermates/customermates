import type { Browser, Page } from "@playwright/test";

import { randomBytes, randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";

import englishMessages from "../../i18n/locales/en.json" with { type: "json" };
import { companyPath } from "./app-paths";
import { collectPageErrors, expect, test } from "./fixtures";
import { localE2eEnvironment } from "./local-environment";
import { clickHydrated, expectHydrated } from "./workspace-switching";

function strongPassword() {
  return `${randomBytes(12).toString("hex")}Aa1!`;
}

async function seedPassword(database: import("pg").Client, authUserId: string) {
  const password = strongPassword();
  await database.query(
    'INSERT INTO "AuthAccount" (id,"accountId","providerId","userId",password,"updatedAt") VALUES ($1,$2,\'credential\',$2,$3,NOW())',
    [randomUUID(), authUserId, await hashPassword(password)],
  );
  const login = await database.query<{ email: string }>('SELECT email FROM "AuthUser" WHERE id=$1', [authUserId]);
  return { email: login.rows[0].email, password };
}

async function signInElsewhere(browser: Browser, email: string, password: string) {
  const context = await browser.newContext({ baseURL: localE2eEnvironment().baseUrl });
  const page = await context.newPage();
  await page.goto("/en/auth/signin");
  await expectHydrated(page.locator("#email"));
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await clickHydrated(page.getByRole("button", { name: englishMessages.SignInForm.signInCta, exact: true }));
  await expect(page).not.toHaveURL(/\/auth\/signin/);
  return page;
}

async function expectSignedIn(page: Page, companyId: string) {
  await page.goto(companyPath(companyId, "/dashboard"));
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.locator("#dashboard-add-widget")).toBeVisible();
}

async function expectSignedOut(page: Page, companyId: string) {
  await page.goto(companyPath(companyId, "/dashboard"));
  await expect(page).toHaveURL(/\/auth\/signin/);
}

test("changing the password signs every other browser out and keeps the current one", async ({
  page,
  browser,
  database,
  workspace,
}) => {
  const errors = collectPageErrors(page);
  const { email, password } = await seedPassword(database, workspace.authUserId);
  const other = await signInElsewhere(browser, email, password);
  try {
    await expectSignedIn(page, workspace.companyId);
    await expectSignedIn(other, workspace.companyId);

    const newPassword = strongPassword();
    const response = await page.request.post("/api/auth/change-password", {
      headers: { origin: localE2eEnvironment().baseUrl },
      data: { currentPassword: password, newPassword, revokeOtherSessions: false },
    });
    expect(response.status()).toBe(200);

    await expectSignedIn(page, workspace.companyId);
    await expectSignedOut(other, workspace.companyId);
    const sessions = await database.query('SELECT id FROM "AuthSession" WHERE "userId"=$1', [workspace.authUserId]);
    expect(sessions.rowCount).toBe(1);
  } finally {
    await other.context().close();
  }
  expect(errors).toEqual([]);
});

test("resetting the password signs every browser out", async ({ page, browser, database, workspace }) => {
  const errors = collectPageErrors(page);
  const { email, password } = await seedPassword(database, workspace.authUserId);
  const other = await signInElsewhere(browser, email, password);
  const resetContext = await browser.newContext({ baseURL: localE2eEnvironment().baseUrl });
  try {
    await expectSignedIn(page, workspace.companyId);
    await expectSignedIn(other, workspace.companyId);

    const token = randomBytes(24).toString("base64url");
    await database.query(
      'INSERT INTO "AuthVerification" (id,identifier,value,"expiresAt","createdAt","updatedAt") VALUES ($1,$2,$3,NOW()+interval \'1 hour\',NOW(),NOW())',
      [randomUUID(), `reset-password:${token}`, workspace.authUserId],
    );
    const reset = await resetContext.newPage();
    await reset.goto(`/en/auth/reset-password?token=${token}`);
    await expectHydrated(reset.locator("#password"));
    const newPassword = strongPassword();
    await reset.locator("#password").fill(newPassword);
    await reset.locator("#confirmPassword").fill(newPassword);
    await clickHydrated(reset.getByRole("button", { name: englishMessages.Common.actions.reset, exact: true }));
    await expect.poll(async () => (await database.query('SELECT 1 FROM "AuthVerification" WHERE identifier=$1', [`reset-password:${token}`])).rowCount).toBe(0);
    await expect.poll(async () => (await database.query('SELECT id FROM "AuthSession" WHERE "userId"=$1', [workspace.authUserId])).rowCount).toBe(0);

    await expectSignedOut(page, workspace.companyId);
    await expectSignedOut(other, workspace.companyId);
  } finally {
    await other.context().close();
    await resetContext.close();
  }
  expect(errors).toEqual([]);
});
