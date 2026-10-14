import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { test as base, expect, type Browser, type BrowserContext, type Page, type TestInfo } from "@playwright/test";
import { Client } from "pg";

import { presetId } from "../../features/records/crm-preset";
import { localE2eEnvironment } from "./local-environment";
import { BrowserDiagnostics, collectPageErrors } from "./browser-diagnostics";

/**
 * Helpers for the demo seed specs: they read the seeded Northwind Labs workspace (`npx prisma db seed` runs before
 * the suite) and sign in as its members. Seeded data is shared by every spec in a run, so these specs only read it,
 * or restore what they change before they finish.
 */
export const DEMO_COMPANY_ID = "10000000-0000-4000-8000-000000000001";

const fixtureId = (prefix: string, index: number) => `${prefix}-0000-4000-8000-${String(index).padStart(12, "0")}`;

export const DEMO_MEMBERS = {
  maxBergmann: { userId: "30000000-0000-4000-8000-000000000001" },
  sofiaRossi: { userId: "30000000-0000-4000-8000-000000000002" },
  elenaHoffmann: { userId: "30000000-0000-4000-8000-000000000003" },
  claraNeumann: { userId: fixtureId("30000000", 5) },
  marcoSilva: { userId: fixtureId("30000000", 6) },
  kianRahimi: { userId: fixtureId("30000000", 7) },
  lauraFischer: { userId: fixtureId("30000000", 8) },
} as const;
export type DemoMember = keyof typeof DEMO_MEMBERS;

/** `presetId` of the seeded workspace: list, field, option and relationship ids. */
export const demoId = (key: string) => presetId(DEMO_COMPANY_ID, key);

/** The six dashboards: Sales is the main dashboard (widgets without a view), the others are dashboard views. */
export const DEMO_DASHBOARDS = [
  { id: null, name: "Sales" },
  { id: fixtureId("1f200000", 2), name: "Revenue and renewals" },
  { id: fixtureId("1f200000", 3), name: "Support" },
  { id: fixtureId("1f200000", 4), name: "Marketing" },
  { id: fixtureId("1f200000", 5), name: "Team activity" },
  { id: fixtureId("1f200000", 6), name: "Hiring" },
] as const;

/** The email of a seeded member, read from the database so the specs follow the seed. */
async function memberEmail(database: Client, member: DemoMember) {
  const { userId } = DEMO_MEMBERS[member];
  const { rows } = await database.query('SELECT email FROM "User" WHERE id=$1 AND "companyId"=$2', [
    userId,
    DEMO_COMPANY_ID,
  ]);
  if (!rows[0]) throw new Error(`The seeded member ${member} is missing`);
  return rows[0].email as string;
}

/**
 * Signs `context` in as a seeded member. Members without a sign-in identity get one (keyed by their user id, so
 * repeated and parallel calls share it); the session is removed by the returned cleanup.
 */
export async function signInMember(context: BrowserContext, database: Client, member: DemoMember) {
  const { baseUrl } = localE2eEnvironment();
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("A local authentication secret is required");
  const email = await memberEmail(database, member);
  await database.query(
    'INSERT INTO "AuthUser" (id,"companyId",email,name,"emailVerified","updatedAt") VALUES ($1,$2,$3,$4,true,NOW()) ON CONFLICT DO NOTHING',
    [DEMO_MEMBERS[member].userId, DEMO_COMPANY_ID, email, member],
  );
  const { rows } = await database.query('SELECT id FROM "AuthUser" WHERE email=$1', [email]);
  const sessionId = randomUUID();
  const token = randomBytes(32).toString("hex");
  await database.query(
    'INSERT INTO "AuthSession" (id,token,"userId","expiresAt","createdAt","updatedAt") VALUES ($1,$2,$3,NOW()+interval \'1 hour\',NOW(),NOW())',
    [sessionId, token, rows[0].id],
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
  // Seeded avatars point at customermates.com; serve them from public/ and keep every other origin offline.
  await context.route(
    (url) => !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) && !["data:", "blob:"].includes(url.protocol),
    async (route) => {
      const url = new URL(route.request().url());
      const local = resolve("public", url.pathname.slice(1));
      if (
        url.hostname === "customermates.com" &&
        /^\/demo\/avatars\/photos\/[a-z-]+\.png$/.test(url.pathname) &&
        existsSync(local)
      )
        await route.fulfill({ path: local });
      else await route.abort("blockedbyclient");
    },
  );
  return () => database.query('DELETE FROM "AuthSession" WHERE id=$1', [sessionId]).then(() => undefined);
}

/** A second browser context signed in as `member`, shaped like the test's project (phone or desktop). */
export async function memberPage(browser: Browser, database: Client, member: DemoMember, testInfo: TestInfo) {
  const { baseUrl } = localE2eEnvironment();
  const { viewport, isMobile, hasTouch, userAgent } = testInfo.project.use;
  const context = await browser.newContext({
    baseURL: baseUrl,
    viewport,
    isMobile,
    hasTouch,
    userAgent,
    locale: "en-GB",
    reducedMotion: "reduce",
  });
  BrowserDiagnostics.of(testInfo).watch(context);
  const signOut = await signInMember(context, database, member);
  const page = await context.newPage();
  return {
    page,
    errors: collectPageErrors(page),
    close: async () => {
      await context.close();
      await signOut();
    },
  };
}

/** Waits until the fonts are loaded and two frames are painted, so a screenshot shows the settled layout. */
export async function paintedFrames(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

type Fixtures = { database: Client; errors: string[] };

/** `page` is signed in as Max Bergmann, the seeded admin; `errors` collects app errors on it. */
export const test = base.extend<Fixtures>({
  database: async ({}, use) => {
    const client = new Client({ connectionString: localE2eEnvironment().databaseUrl });
    await client.connect();
    try {
      await use(client);
    } finally {
      await client.end();
    }
  },
  context: async ({ context, database }, use, testInfo) => {
    const diagnostics = BrowserDiagnostics.of(testInfo).watch(context);
    const signOut = await signInMember(context, database, "maxBergmann");
    try {
      await use(context);
    } finally {
      await Promise.all(context.pages().map((page) => page.close()));
      await signOut();
    }
    await diagnostics.verify(testInfo);
  },
  errors: async ({ page }, use) => {
    await use(collectPageErrors(page));
  },
});
export { expect };

/** The numbers in a displayed value: "€12,480.00" -> 12480, "-3" -> -3. */
export function displayedNumber(text: string) {
  const cleaned = text.replace(/[^0-9.,-]/g, "").replace(/,/g, "");
  if (!/\d/.test(cleaned)) throw new Error(`No number in "${text}"`);
  return Number(cleaned);
}
