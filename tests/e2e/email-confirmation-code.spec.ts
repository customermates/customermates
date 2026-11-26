import { randomUUID } from "node:crypto";

import type { Browser, Page, TestInfo } from "@playwright/test";
import type { Client } from "pg";

import englishMessages from "../../i18n/locales/en.json" with { type: "json" };
import { expect, test } from "./fixtures";
import { openOnboardingAsNewLogin } from "./onboarding-login";
import { sentEmailsTo } from "./transactional-mail";
import { anonymous } from "./view-sharing-helpers";
import { clickHydrated, e2eAppMode, expectHydrated } from "./workspace-switching";

const PASSWORD = "SignupHorse123!";
const code = englishMessages.EmailCode;
const confirmEmail = englishMessages.OnboardingWizard.confirmEmail;

async function signUpWithPassword(browser: Browser, testInfo: TestInfo, name: string) {
  const visitor = await anonymous(browser, testInfo);
  const { page } = visitor;
  const email = `${name}-${randomUUID()}@onboarding.test`;
  await page.goto("/en/auth/signup");
  await expectHydrated(page.locator("#email"));
  await page.locator("#email").fill(email);
  await page.locator("#confirmEmail").fill(email);
  await page.locator("#password").fill(PASSWORD);
  await page.locator("#confirmPassword").fill(PASSWORD);
  await clickHydrated(page.getByRole("button", { name: englishMessages.SignUpForm.signUpCta, exact: true }));
  await expect(page).toHaveURL(/\/en\/onboarding(?:\?.*)?$/, { timeout: 30_000 });
  const choices = page.getByRole("group", { name: englishMessages.OnboardingChoice.optionsLabel, exact: true });
  await clickHydrated(
    choices.getByRole("button", { name: new RegExp(`^${englishMessages.OnboardingChoice.create.title}`) }),
  );
  await expect(page).toHaveURL(/\/en\/onboarding\/wizard(?:\?intent=[\w.-]+)?$/);
  await expect(page.locator("#onboarding-confirm-email")).toBeVisible();
  return { ...visitor, email };
}

async function mailedCode(email: string): Promise<string> {
  await expect.poll(() => sentEmailsTo(email).length, { timeout: 30_000 }).toBeGreaterThan(0);
  const subject = sentEmailsTo(email).at(-1)?.subject ?? "";
  const match = /^(\d{6}) /.exec(subject);
  if (!match) throw new Error(`no confirmation code in the subject "${subject}"`);
  return match[1];
}

function wrongCode(right: string) {
  return right === "000000" ? "111111" : "000000";
}

async function isVerified(database: Client, email: string) {
  const { rows } = await database.query<{ emailVerified: boolean }>(
    'SELECT "emailVerified" FROM "AuthUser" WHERE email=$1',
    [email],
  );
  return rows[0]?.emailVerified;
}

async function enterCode(page: Page, value: string) {
  const field = page.locator("#onboarding-confirm-email-code");
  await expectHydrated(field);
  await field.fill(value);
}

test.describe("email confirmation code", () => {
  test.skip(e2eAppMode() !== "cloud", "Password sign-ups confirm their email before onboarding on the cloud");

  test("the code from the mail confirms a password sign-up, a wrong code shows an error, and the page moves on", async ({
    browser,
    database,
  }, testInfo) => {
    test.setTimeout(120_000);
    const owner = await signUpWithPassword(browser, testInfo, "code-owner");
    try {
      const { page } = owner;
      const right = await mailedCode(owner.email);
      const [mail] = sentEmailsTo(owner.email);
      expect(mail.subject).toBe(englishMessages.VerifyEmail.subject.replace("{code}", right));
      expect(mail.html).toContain(right);
      expect(mail.html).not.toMatch(/verify-email\?token=|\/api\/auth\/verify-email/);
      await expect(page.locator("#onboarding-confirm-email")).toContainText(
        confirmEmail.body.replace("<strong>{email}</strong>", owner.email),
      );

      await enterCode(page, wrongCode(right));
      await expect(page.getByRole("alert").filter({ hasText: code.errors.invalid })).toBeVisible();
      await expect(page.locator("#onboarding-confirm-email-code")).toHaveAttribute("aria-invalid", "true");
      expect(await isVerified(database, owner.email)).toBe(false);
      await page.screenshot({ path: testInfo.outputPath("confirm-email-wrong-code.png"), fullPage: true });

      await enterCode(page, right);
      await expect(page.locator("#firstName")).toBeVisible({ timeout: 30_000 });
      await expect(page.locator("#onboarding-confirm-email")).toHaveCount(0);
      expect(await isVerified(database, owner.email)).toBe(true);
      expect(owner.errors).toEqual([]);
    } finally {
      await owner.close();
    }
  });

  test("only the browser that signed up can confirm the address: another browser gets nowhere with the code", async ({
    browser,
    database,
  }, testInfo) => {
    test.setTimeout(150_000);
    const owner = await signUpWithPassword(browser, testInfo, "code-signup");
    const stranger = await anonymous(browser, testInfo);
    const otherLogin = await openOnboardingAsNewLogin(browser, database, { emailVerified: false, name: "Other Login" });
    try {
      const right = await mailedCode(owner.email);

      await stranger.page.goto("/en/auth/verify-email");
      await expect(stranger.page.getByText(englishMessages.VerifyEmailCard.signedOutBody, { exact: true })).toBeVisible();
      await expect(stranger.page.locator("#verify-email-code")).toHaveCount(0);

      await enterCode(otherLogin.page, right);
      await expect(otherLogin.page.getByRole("alert").filter({ hasText: code.errors.invalid })).toBeVisible();
      expect(await isVerified(database, owner.email)).toBe(false);
      expect(await isVerified(database, otherLogin.email)).toBe(false);

      await enterCode(owner.page, right);
      await expect(owner.page.locator("#firstName")).toBeVisible({ timeout: 30_000 });
      expect(await isVerified(database, owner.email)).toBe(true);
      await expect(otherLogin.page.locator("#onboarding-confirm-email")).toBeVisible();
    } finally {
      await owner.close();
      await stranger.close();
      await otherLogin.context.close();
    }
  });
});

test("an old confirmation link lands on the email verification page, which asks for a code instead", async ({
  browser,
}, testInfo) => {
  const visitor = await anonymous(browser, testInfo);
  try {
    const { page } = visitor;
    const callbackURL = encodeURIComponent("/auth/verify-email?verified=1");
    await page.goto(`/api/auth/verify-email?token=${randomUUID()}&callbackURL=${callbackURL}`);
    await expect(page).toHaveURL(/\/en\/auth\/verify-email\?link=retired$/);
    await expect(page.getByText(englishMessages.VerifyEmailCard.retiredLinkSignedOut, { exact: true })).toBeVisible();
    await expect(page.getByText(englishMessages.VerifyEmailCard.signedOutBody, { exact: true })).toBeVisible();
    expect(visitor.errors).toEqual([]);
  } finally {
    await visitor.close();
  }
});
