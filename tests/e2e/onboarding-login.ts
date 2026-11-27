import { createHmac, randomBytes, randomUUID } from "node:crypto";

import type { Browser } from "@playwright/test";
import type { Client } from "pg";

import englishMessages from "../../i18n/locales/en.json" with { type: "json" };
import { expect } from "./fixtures";
import { localE2eEnvironment } from "./local-environment";
import { clickHydrated } from "./workspace-switching";

// A login that signed up a moment ago and has no workspace yet, opened on the create-workspace onboarding.
export async function openOnboardingAsNewLogin(
  browser: Browser,
  database: Client,
  options: { emailVerified: boolean; name: string },
) {
  const { baseUrl } = localE2eEnvironment();
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("A local authentication secret is required");
  const context = await browser.newContext({ baseURL: baseUrl });
  const page = await context.newPage();
  const authUserId = randomUUID();
  const email = `${options.name.toLowerCase().replace(/\W+/g, "-")}-${randomUUID()}@onboarding.test`;
  await database.query(
    'INSERT INTO "AuthUser" (id,"companyId",email,name,"emailVerified","updatedAt") VALUES ($1,NULL,$2,$2,$3,NOW())',
    [authUserId, email, options.emailVerified],
  );
  const token = randomBytes(32).toString("hex");
  await database.query(
    'INSERT INTO "AuthSession" (id,token,"userId","expiresAt","createdAt","updatedAt") VALUES ($1,$2,$3,NOW()+interval \'1 hour\',NOW(),NOW())',
    [randomUUID(), token, authUserId],
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
  const choices = page.getByRole("group", { name: englishMessages.OnboardingChoice.optionsLabel, exact: true });
  await clickHydrated(
    choices.getByRole("button", { name: new RegExp(`^${englishMessages.OnboardingChoice.create.title}`) }),
  );
  await expect(page).toHaveURL(/\/en\/onboarding\/wizard(?:\?intent=[\w.-]+)?$/);
  return { context, page, authUserId, email };
}
