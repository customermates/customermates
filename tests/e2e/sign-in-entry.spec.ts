import { randomBytes, randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";

import englishMessages from "../../i18n/locales/en.json" with { type: "json" };
import { companyPath } from "./app-paths";
import { expect, test } from "./fixtures";
import { anonymous } from "./view-sharing-helpers";
import { clickHydrated, e2eAppMode, expectHydrated } from "./workspace-switching";

test("the sign-in page is served prerendered, with the form already in the document", async ({
  browser,
  request,
}, testInfo) => {
  test.skip(e2eAppMode() !== "cloud", "The self-hosted build renders its pages on first request");
  const response = await request.get("/en/auth/signin");
  expect(response.status()).toBe(200);
  expect(response.headers()["x-nextjs-prerender"]).toMatch(/^1(, 1)*$/);
  const html = await response.text();
  expect(html).toContain('id="email"');
  expect(html).toContain('id="password"');

  const visitor = await anonymous(browser, testInfo);
  try {
    await visitor.page.goto("/en/auth/signin");
    await expect(visitor.page.locator('[data-sign-in-entry="ready"]')).toBeAttached();
    await expect(visitor.page.locator("#email")).toBeVisible();
    expect(visitor.errors).toEqual([]);
  } finally {
    await visitor.close();
  }
});

test("a signed-in visitor who opens the sign-in page is sent on to the app", async ({ page }) => {
  await page.goto("/en/auth/signin");
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.locator("#dashboard-add-widget")).toBeVisible();
});

test("signing in from a link to a protected page returns to that page", async ({
  browser,
  database,
  workspace,
}, testInfo) => {
  const password = `${randomBytes(12).toString("hex")}Aa1!`;
  await database.query(
    'INSERT INTO "AuthAccount" (id,"accountId","providerId","userId",password,"updatedAt") VALUES ($1,$2,\'credential\',$2,$3,NOW())',
    [randomUUID(), workspace.authUserId, await hashPassword(password)],
  );
  const login = await database.query<{ email: string }>('SELECT email FROM "AuthUser" WHERE id=$1', [
    workspace.authUserId,
  ]);

  const visitor = await anonymous(browser, testInfo);
  try {
    const { page } = visitor;
    await page.goto(companyPath(workspace.companyId, "/routines"));
    await expect(page).toHaveURL(/\/auth\/signin\?callbackURL=/);
    await expectHydrated(page.locator("#email"));
    await page.locator("#email").fill(login.rows[0].email);
    await page.locator("#password").fill(password);
    await clickHydrated(page.getByRole("button", { name: englishMessages.SignInForm.signInCta, exact: true }));
    await expect(page).toHaveURL(/\/routines/);
    expect(visitor.errors).toEqual([]);
  } finally {
    await visitor.close();
  }
});
