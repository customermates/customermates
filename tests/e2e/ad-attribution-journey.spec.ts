import { createHmac, randomBytes, randomUUID } from "node:crypto";

import type { Browser, BrowserContext, Cookie, Page } from "@playwright/test";
import type { Client } from "pg";

import englishMessages from "../../i18n/locales/en.json" with { type: "json" };
import { collectPageErrors, expect, test } from "./fixtures";
import { changeProviderSubscription, deliverSubscriptionWebhook, startProviderSubscription } from "./lemonsqueezy";
import { localE2eEnvironment } from "./local-environment";
import { removeBrowserWorkspace } from "./workspace";
import { clickHydrated, e2eAppMode, expectHydrated } from "./workspace-switching";

test.skip(e2eAppMode() !== "cloud", "Ad click attribution exists in the managed cloud only");

const COOKIE = "cm_ad_attribution";
const LANDING = "/en/about";
const consent = englishMessages.AcquisitionConsent;

type StoredCookie = {
  consent: { advertising: boolean; noticeVersion: string };
  clicks: Array<{ provider: string; kind: string; value: string }>;
};

type Visitor = { context: BrowserContext; page: Page; authUserId: string; email: string };

function verifiedCookiePayload(cookie: Cookie): StoredCookie {
  const secret = process.env.BETTER_AUTH_SECRET?.trim();
  if (!secret) throw new Error("A local authentication secret is required");
  const [payload, signature] = cookie.value.split(".");
  const expected = createHmac("sha256", `ad-attribution:v1:${secret}`).update(payload).digest("hex");
  expect(signature).toBe(expected);
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as StoredCookie;
}

async function attributionCookie(context: BrowserContext) {
  return (await context.cookies()).find((cookie) => cookie.name === COOKIE) ?? null;
}

async function openVisitor(browser: Browser): Promise<Visitor> {
  const { baseUrl } = localE2eEnvironment();
  const context = await browser.newContext({ baseURL: baseUrl });
  await context.route(
    (url) => !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) && !["data:", "blob:"].includes(url.protocol),
    (route) => route.abort("blockedbyclient"),
  );
  return {
    context,
    page: await context.newPage(),
    authUserId: randomUUID(),
    email: `ad-visitor-${randomUUID()}@example.test`,
  };
}

async function land(visitor: Visitor, search: string) {
  await visitor.page.goto(`${LANDING}${search}`);
  await expectHydrated(visitor.page.getByRole("button", { name: "Privacy choices", exact: true }).first());
}

async function signUp(database: Client, visitor: Visitor, workspaceName: string) {
  const { baseUrl } = localE2eEnvironment();
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("A local authentication secret is required");
  await database.query(
    'INSERT INTO "AuthUser" (id,"companyId",email,name,"emailVerified","updatedAt") VALUES ($1,NULL,$2,\'Ada Visitor\',true,NOW())',
    [visitor.authUserId, visitor.email],
  );
  const token = randomBytes(32).toString("hex");
  await database.query(
    'INSERT INTO "AuthSession" (id,token,"userId","expiresAt","createdAt","updatedAt") VALUES ($1,$2,$3,NOW()+interval \'1 hour\',NOW(),NOW())',
    [randomUUID(), token, visitor.authUserId],
  );
  await visitor.context.addCookies([
    {
      name: "app.session_token",
      value: encodeURIComponent(`${token}.${createHmac("sha256", secret).update(token).digest("base64")}`),
      url: baseUrl,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  const page = visitor.page;
  await page.goto("/en/onboarding");
  const choices = page.getByRole("group", { name: englishMessages.OnboardingChoice.optionsLabel, exact: true });
  await clickHydrated(
    choices.getByRole("button", { name: new RegExp(`^${englishMessages.OnboardingChoice.create.title}`) }),
  );
  await expect(page).toHaveURL(/\/en\/onboarding\/wizard(?:\?intent=[\w.-]+)?$/);
  await expectHydrated(page.locator("#firstName"));
  await page.locator("#firstName").fill("Ada");
  await page.locator("#lastName").fill("Visitor");
  await page.locator("#workspaceName").fill(workspaceName);
  await page.locator("#agreeToTerms").click();
  await clickHydrated(page.getByRole("button", { name: englishMessages.OnboardingWizard.next, exact: true }));
  await expect
    .poll(async () => {
      const { rows } = await database.query<{ id: string }>('SELECT id FROM "Company" WHERE "createdByAuthUserId"=$1', [
        visitor.authUserId,
      ]);
      return rows.map((row) => row.id);
    })
    .toHaveLength(1);
  const { rows } = await database.query<{ id: string }>('SELECT id FROM "Company" WHERE "createdByAuthUserId"=$1', [
    visitor.authUserId,
  ]);
  return rows[0].id;
}

async function attributionRows(database: Client, companyId: string) {
  const { rows } = await database.query<{ provider: string; identifierKind: string; identifierValue: string }>(
    'SELECT provider,"identifierKind","identifierValue" FROM "AdAttribution" WHERE "companyId"=$1 ORDER BY provider',
    [companyId],
  );
  return rows;
}

async function conversionTypes(database: Client, companyId: string) {
  const { rows } = await database.query<{ type: string }>(
    'SELECT type::text FROM "ConversionEvent" WHERE "companyId"=$1 ORDER BY type::text',
    [companyId],
  );
  return rows.map((row) => row.type);
}

async function closeVisitor(database: Client, visitor: Visitor, companyId: string | null) {
  await visitor.context.close();
  await removeBrowserWorkspace(database, {
    companyId: (companyId ?? randomUUID()) as ReturnType<typeof randomUUID>,
    authUserId: visitor.authUserId as ReturnType<typeof randomUUID>,
    userId: randomUUID(),
    slug: "",
  });
}

test("a consented Google click reaches the signup and the first payment once, and the export lists both", async ({
  browser,
  page,
  request,
  database,
  workspace,
}) => {
  test.setTimeout(240_000);
  const gclid = `Cj0KE2E_${randomUUID().replaceAll("-", "")}`;
  const visitor = await openVisitor(browser);
  const errors = collectPageErrors(visitor.page);
  let companyId: string | null = null;
  try {
    await test.step("the landing with exactly one gclid opens the card and stores nothing yet", async () => {
      await land(visitor, `?gclid=${gclid}`);
      const card = visitor.page.getByTestId("ad-attribution-consent-card");
      await expect(card).toBeVisible();
      await expect(card.getByRole("heading", { name: consent.title, exact: true })).toBeVisible();
      await expect(card).toContainText("Google");
      expect(await attributionCookie(visitor.context)).toBeNull();
    });

    await test.step("Allow sets the signed, HTTP-only cookie with the click and cleans the URL", async () => {
      const card = visitor.page.getByTestId("ad-attribution-consent-card");
      await clickHydrated(card.getByRole("button", { name: consent.allowAttribution, exact: true }));
      await expect(card).not.toBeVisible();
      await expect.poll(() => new URL(visitor.page.url()).search).toBe("");
      const cookie = await attributionCookie(visitor.context);
      expect(cookie).not.toBeNull();
      expect(cookie).toMatchObject({ httpOnly: true, sameSite: "Lax", path: "/" });
      const stored = verifiedCookiePayload(cookie as Cookie);
      expect(stored.consent.advertising).toBe(true);
      expect(stored.clicks).toEqual([expect.objectContaining({ provider: "google_ads", kind: "gclid", value: gclid })]);
    });

    await test.step("a new-workspace registration writes the attribution row and the signup conversion", async () => {
      companyId = await signUp(database, visitor, `Ad Journey ${randomUUID().slice(0, 8)}`);
      await expect.poll(() => attributionRows(database, companyId as string)).toEqual([
        { provider: "google_ads", identifierKind: "gclid", identifierValue: gclid },
      ]);
      expect(await conversionTypes(database, companyId)).toEqual(["signup"]);
      const cleared = verifiedCookiePayload((await attributionCookie(visitor.context)) as Cookie);
      expect(cleared.consent.advertising).toBe(true);
      expect(cleared.clicks).toEqual([]);
    });

    await test.step("the subscription that makes the workspace paying writes the paid conversion once", async () => {
      const owner = companyId as string;
      await database.query(
        'UPDATE "Subscription" SET status=\'expired\',"trialEndDate"=NULL,"currentPeriodEnd"=NULL WHERE "companyId"=$1',
        [owner],
      );
      const paid = startProviderSubscription(owner, "business", 1, { name: "Ada Visitor", email: visitor.email });
      await deliverSubscriptionWebhook(request, "subscription_updated", changeProviderSubscription(paid.id, {}));
      await expect
        .poll(async () => {
          const { rows } = await database.query<{ status: string }>(
            'SELECT status::text FROM "Subscription" WHERE "companyId"=$1',
            [owner],
          );
          return rows[0]?.status;
        })
        .toBe("active");
      const { rows: before } = await database.query<{ occurredAt: Date }>(
        'SELECT "occurredAt" FROM "ConversionEvent" WHERE "companyId"=$1 AND type=\'paid\'',
        [owner],
      );
      expect(before).toHaveLength(1);
      for (const event of ["subscription_created", "subscription_updated", "subscription_created"] as const)
        await deliverSubscriptionWebhook(request, event, paid);
      const { rows: after } = await database.query<{ occurredAt: Date }>(
        'SELECT "occurredAt" FROM "ConversionEvent" WHERE "companyId"=$1 AND type=\'paid\'',
        [owner],
      );
      expect(after).toEqual(before);
      expect(await conversionTypes(database, owner)).toEqual(["paid", "signup"]);
    });

    await test.step("the operator export lists the signup and the paid row for the gclid", async () => {
      await database.query('UPDATE "AuthUser" SET "isPlatformOperator"=true WHERE id=$1', [workspace.authUserId]);
      await page.goto("/en/operator/overview");
      const generate = page.getByRole("button", { name: "Generate conversion export", exact: true });
      await clickHydrated(generate);
      const download = page.getByRole("link", { name: "Google Ads CSV", exact: true });
      await expect(download).toBeVisible();
      const href = (await download.getAttribute("href")) as string;
      const csv = decodeURIComponent(href.replace(/^data:text\/csv;charset=utf-8,/, "")).split("\n");
      expect(csv[0]).toBe("Parameters:TimeZone=+0000");
      const mine = csv.filter((line) => line.startsWith(`${gclid},`));
      expect(mine.map((line) => line.split(",")[1]).sort()).toEqual(["Customermates paid", "Customermates signup"]);
      for (const line of mine) expect(line).toMatch(/,[0-9a-f]{32},Granted,Denied$/);
    });
    expect(errors).toEqual([]);
  } finally {
    await closeVisitor(database, visitor, companyId);
  }
});

test("No thanks keeps only the preference and the registration writes no attribution", async ({
  browser,
  database,
}) => {
  test.setTimeout(180_000);
  const gclid = `Cj0KNO_${randomUUID().replaceAll("-", "")}`;
  const visitor = await openVisitor(browser);
  let companyId: string | null = null;
  try {
    await land(visitor, `?gclid=${gclid}`);
    const card = visitor.page.getByTestId("ad-attribution-consent-card");
    await expect(card).toBeVisible();
    await clickHydrated(card.getByRole("button", { name: consent.necessaryOnly, exact: true }));
    await expect(card).not.toBeVisible();
    await expect.poll(() => new URL(visitor.page.url()).search).toBe("");
    const stored = verifiedCookiePayload((await attributionCookie(visitor.context)) as Cookie);
    expect(stored.consent.advertising).toBe(false);
    expect(stored.clicks).toEqual([]);
    expect(JSON.stringify(stored)).not.toContain(gclid);

    companyId = await signUp(database, visitor, `Ad Refusal ${randomUUID().slice(0, 8)}`);
    expect(await attributionRows(database, companyId)).toEqual([]);
    expect(await conversionTypes(database, companyId)).toEqual([]);
  } finally {
    await closeVisitor(database, visitor, companyId);
  }
});

test("a landing with two click identifiers opens no card, sets no cookie and writes nothing", async ({
  browser,
  database,
}) => {
  test.setTimeout(180_000);
  const visitor = await openVisitor(browser);
  let companyId: string | null = null;
  try {
    const consentReads = visitor.page.waitForResponse(
      (response) => response.request().method() === "POST" && response.url().includes(LANDING),
    );
    await land(visitor, `?gclid=Cj0KTWO_${randomUUID().slice(0, 8)}&gbraid=0AAAA${randomUUID().slice(0, 8)}`);
    await consentReads;
    await visitor.page.waitForTimeout(1_000);
    await expect(visitor.page.getByTestId("ad-attribution-consent-card")).toHaveCount(0);
    expect(await attributionCookie(visitor.context)).toBeNull();

    companyId = await signUp(database, visitor, `Ad Two Ids ${randomUUID().slice(0, 8)}`);
    expect(await attributionRows(database, companyId)).toEqual([]);
    expect(await conversionTypes(database, companyId)).toEqual([]);
    expect(await attributionCookie(visitor.context)).toBeNull();
  } finally {
    await closeVisitor(database, visitor, companyId);
  }
});
