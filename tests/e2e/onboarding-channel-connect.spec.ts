import { createHmac, randomBytes, randomUUID } from "node:crypto";

import englishMessages from "../../i18n/locales/en.json" with { type: "json" };
import { expect, test } from "./fixtures";
import { localWebhookSecret } from "./local-email-provider.mjs";
import { localE2eEnvironment } from "./local-environment";
import { clickHydrated, e2eAppMode, expectHydrated } from "./workspace-switching";

test.skip(e2eAppMode() !== "cloud", "Channels connect only in the cloud");

const steps = englishMessages.OnboardingWizard.steps;

// The provider's hosted sign-in is simulated by the local provider (tests/e2e/local-email-provider.mjs): the link
// returns straight to the redirect address, and the account is registered only when the signed account.add webhook
// arrives, as in production where that webhook follows the redirect by a few seconds.
test("a mailbox connected in the onboarding channel step returns to that step and lets the owner continue", async ({
  browser,
  database,
}) => {
  test.setTimeout(180_000);
  const { baseUrl } = localE2eEnvironment();
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("A local authentication secret is required");
  const context = await browser.newContext({ baseURL: baseUrl });
  const page = await context.newPage();
  const heading = (name: string) => page.getByRole("heading", { level: 1, name, exact: true });
  const userId = randomUUID();
  const email = `channel-${randomUUID()}@onboarding-connect.test`;

  await database.query(
    'INSERT INTO "AuthUser" (id,"companyId",email,name,"emailVerified","updatedAt") VALUES ($1,NULL,$2,\'Mia Mailbox\',true,NOW())',
    [userId, email],
  );
  const token = randomBytes(32).toString("hex");
  await database.query(
    'INSERT INTO "AuthSession" (id,token,"userId","expiresAt","createdAt","updatedAt") VALUES ($1,$2,$3,NOW()+interval \'1 hour\',NOW(),NOW())',
    [randomUUID(), token, userId],
  );
  await context.addCookies([
    {
      name: "app.session_token",
      value: encodeURIComponent(`${token}.${createHmac("sha256", secret).update(token).digest("base64")}`),
      url: baseUrl,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);

  await page.goto("/en/onboarding");
  const choices = page.getByRole("group", {
    name: englishMessages.OnboardingChoice.optionsLabel,
    exact: true,
  });
  await clickHydrated(
    choices.getByRole("button", {
      name: new RegExp(`^${englishMessages.OnboardingChoice.create.title}`),
    }),
  );
  await expectHydrated(page.locator("#firstName"));
  await page.locator("#firstName").fill("Mia");
  await page.locator("#lastName").fill("Mailbox");
  await page.locator("#agreeToTerms").click();
  await page.locator("#onboarding-team-size-small").click();
  await clickHydrated(
    page.getByRole("button", {
      name: englishMessages.OnboardingWizard.continue,
      exact: true,
    }),
  );

  const goal = page.locator("#onboarding-goal-continue");
  const sourceSkip = page.locator("#onboarding-source-skip");
  await expect(goal.or(sourceSkip)).toBeVisible({ timeout: 30_000 });
  if (await sourceSkip.isVisible()) await clickHydrated(sourceSkip);
  await clickHydrated(goal);
  await clickHydrated(page.locator("#onboarding-next"));

  await expect(heading(steps.channel.title)).toBeVisible();
  await clickHydrated(page.locator("#onboarding-channel-imap"));

  // Back from the (simulated) provider page: the same step of the wizard, not Settings.
  await page.waitForURL(/\/onboarding\/wizard\?channelConnected=imap$/u, {
    timeout: 30_000,
  });
  await expect(heading(steps.channel.title)).toBeVisible();
  await expect(page.locator("#onboarding-channel-finishing")).toBeVisible();
  await expect(page.locator("#onboarding-channel-continue")).toBeDisabled();

  const appUser = await database.query<{ id: string }>('SELECT id FROM "User" WHERE email = $1', [email]);
  const appUserId = appUser.rows[0]?.id;
  if (!appUserId) throw new Error("The onboarding profile step should have created the workspace user");
  const body = JSON.stringify({
    type: "account.add",
    account_id: `e2e_local_imap_${randomUUID()}`,
    state: `${appUserId}.${createHmac("sha256", localWebhookSecret).update(appUserId).digest("hex")}`,
  });
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", localWebhookSecret).update(`${timestamp}.${body}`).digest("hex");
  const webhook = await page.request.post("/api/webhooks/unipile/v2", {
    headers: {
      "content-type": "application/json",
      "unipile-signature": `t=${timestamp},v0=${signature}`,
    },
    data: body,
  });
  expect(webhook.status()).toBe(200);

  const connected = page.locator("#onboarding-channel-connected");
  await expect(connected).toBeVisible({ timeout: 30_000 });
  await expect(connected).toContainText("onboarding-mailbox@example.test");
  await expect(page.locator("#onboarding-channel-finishing")).toHaveCount(0);
  await expect(page.locator("#onboarding-channel-skip")).toHaveCount(0);

  await clickHydrated(page.locator("#onboarding-channel-continue"));
  await expect(heading(steps.connect.title)).toBeVisible({ timeout: 30_000 });
  await context.close();
});
