import { createHmac, randomBytes, randomUUID } from "node:crypto";

import type { Browser, TestInfo } from "@playwright/test";
import type { Client } from "pg";

import { localE2eEnvironment } from "./local-environment";
import { collectErrors } from "./sidebar";

export async function secondUser(browser: Browser, database: Client, companyId: string, testInfo: TestInfo) {
  const { baseUrl } = localE2eEnvironment();
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("A local authentication secret is required");
  const roleId = randomUUID();
  const userId = randomUUID();
  const authUserId = randomUUID();
  const email = `member-${userId}@example.test`;
  await database.query(
    'INSERT INTO "UserRole" (id,"companyId",name,"isSystemRole","updatedAt") VALUES ($1,$2,\'Second admin\',true,NOW())',
    [roleId, companyId],
  );
  await database.query(
    'INSERT INTO "User" (id,"companyId","roleId",email,"firstName","lastName",status,"agreeToTerms","onboardingWizardCompletedAt","displayLanguage","formattingLocale","updatedAt") VALUES ($1,$2,$3,$4,\'Second\',\'Person\',\'active\',true,NOW(),\'en\',\'en\',NOW())',
    [userId, companyId, roleId, email],
  );
  await database.query(
    'INSERT INTO "AuthUser" (id,"companyId",email,name,"emailVerified","updatedAt") VALUES ($1,$2,$3,\'Second Person\',true,NOW())',
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
    errors: collectErrors(page),
    close: async () => {
      await context.close();
      await database.query('DELETE FROM "AuthUser" WHERE id=$1 AND "companyId"=$2', [authUserId, companyId]);
    },
  };
}
