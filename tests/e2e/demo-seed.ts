import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { test as base, expect, type Browser, type BrowserContext, type Page, type TestInfo } from "@playwright/test";
import { Client } from "pg";

import { presetId } from "../../features/records/crm-preset";
import { localE2eEnvironment } from "./local-environment";
import { collectErrors } from "./sidebar";

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

export const demoViewId = (index: number) => fixtureId("1f100000", index);
export const demoFixtureId = fixtureId;

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
  const signOut = await signInMember(context, database, member);
  const page = await context.newPage();
  return {
    page,
    errors: collectErrors(page),
    close: async () => {
      await context.close();
      await signOut();
    },
  };
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
  context: async ({ context, database }, use) => {
    const signOut = await signInMember(context, database, "maxBergmann");
    try {
      await use(context);
    } finally {
      await Promise.all(context.pages().map((page) => page.close()));
      await signOut();
    }
  },
  errors: async ({ page }, use) => {
    await use(collectErrors(page));
  },
});
export { expect };

/** The numbers in a displayed value: "€12,480.00" -> 12480, "-3" -> -3. */
export function displayedNumber(text: string) {
  const cleaned = text.replace(/[^0-9.,-]/g, "").replace(/,/g, "");
  if (!/\d/.test(cleaned)) throw new Error(`No number in "${text}"`);
  return Number(cleaned);
}

/** Decimal values of `fieldKeys` per record of `typeKey`, keyed by record id then field key. */
export async function decimalValues(database: Client, typeKey: string, fieldKeys: string[]) {
  const { rows } = await database.query<{ recordId: string; fieldId: string; value: string | null }>(
    `SELECT v."recordId", v."fieldId", v."decimalValue"::text AS value FROM "RecordValue" v
     JOIN "CrmRecord" r ON r."companyId"=v."companyId" AND r."typeId"=v."typeId" AND r.id=v."recordId"
     WHERE v."companyId"=$1 AND v."typeId"=$2 AND v."fieldId"=ANY($3) AND r."deletedAt" IS NULL`,
    [DEMO_COMPANY_ID, demoId(typeKey), fieldKeys.map(demoId)],
  );
  const byRecord = new Map<string, Record<string, number | null>>();
  const keyOf = new Map(fieldKeys.map((key) => [demoId(key), key]));
  for (const row of rows) {
    const entry = byRecord.get(row.recordId) ?? {};
    entry[keyOf.get(row.fieldId) as string] = row.value === null ? null : Number(row.value);
    byRecord.set(row.recordId, entry);
  }
  return byRecord;
}

/** Linked record ids: outgoing from `sourceId` or incoming to `targetId` over `relationKey`. */
export async function links(database: Client, relationKey: string) {
  const { rows } = await database.query<{ sourceId: string; targetId: string }>(
    `SELECT l."sourceId", l."targetId" FROM "RecordLink" l
     JOIN "CrmRecord" s ON s."companyId"=l."companyId" AND s."typeId"=l."sourceTypeId" AND s.id=l."sourceId"
     JOIN "CrmRecord" t ON t."companyId"=l."companyId" AND t."typeId"=l."targetTypeId" AND t.id=l."targetId"
     WHERE l."companyId"=$1 AND l."relationId"=$2 AND l."deletedAt" IS NULL AND s."deletedAt" IS NULL AND t."deletedAt" IS NULL`,
    [DEMO_COMPANY_ID, demoId(relationKey)],
  );
  return rows;
}

/** Waits until the page settled: no skeletons or spinners left. */
export async function settled(page: Page) {
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await expect(page.locator('[data-slot="skeleton"], [aria-busy="true"]')).toHaveCount(0, { timeout: 30000 });
}
