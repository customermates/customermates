import englishMessages from "../../i18n/locales/en.json" with { type: "json" };
import { expect, test } from "./fixtures";
import { openOnboardingAsNewLogin } from "./onboarding-login";
import { anyWorkspaceUrlPattern } from "./app-paths";
import { uniqueWorkspaceName } from "./workspace-names";
import { clickHydrated, e2eAppMode, expectHydrated } from "./workspace-switching";

test.skip(e2eAppMode() !== "self-hosted", "The self-hosted variant runs against a self-hosted server");

test("a self-hosted owner fills in the profile and lands in the empty workspace without any setup screens", async ({
  browser,
  database,
}, testInfo) => {
  test.setTimeout(120_000);
  const login = await openOnboardingAsNewLogin(browser, database, { emailVerified: true, name: "Hosted Owner" });
  const { page } = login;
  await expectHydrated(page.locator("#firstName"));
  await expect(page.locator("#onboarding-team-size")).toHaveCount(0);
  await expect(page.locator("#agreeToTerms")).toHaveCount(0);
  await page.locator("#firstName").fill("Hanna");
  await page.locator("#lastName").fill("Host");
  await page.locator("#workspaceName").fill(uniqueWorkspaceName("Hosted Studio"));
  await page.screenshot({ path: testInfo.outputPath("self-hosted-profile.png"), fullPage: true });
  await clickHydrated(page.locator("#onboarding-profile-continue"));

  await expect(page).toHaveURL(anyWorkspaceUrlPattern("/dashboard$"), { timeout: 30_000 });
  await expect(page.locator("#setup-start-empty")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { level: 1, name: englishMessages.WorkspaceSetup.questions.workWith.label, exact: true }),
  ).toHaveCount(0);
  const { rows } = await database.query<{ done: Date | null }>(
    'SELECT u."onboardingWizardCompletedAt" AS done FROM "User" u JOIN "AuthUser" a ON a.email=u.email WHERE a.id=$1',
    [login.authUserId],
  );
  expect(rows).toEqual([{ done: expect.any(Date) }]);
  await login.context.close();
});
