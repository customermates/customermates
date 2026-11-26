import { createHmac, randomBytes, randomUUID } from "node:crypto";

import type { BrowserContext, Cookie, Page, TestInfo } from "@playwright/test";

import englishMessages from "../../i18n/locales/en.json" with { type: "json" };
import germanMessages from "../../i18n/locales/de.json" with { type: "json" };
import { collectPageErrors, expect, test } from "./fixtures";
import { localE2eEnvironment } from "./local-environment";
import { removeBrowserWorkspace } from "./workspace";
import { clickHydrated, e2eAppMode, expectHydrated } from "./workspace-switching";

const CAMPAIGN = {
  source: "google",
  medium: "cpc",
  campaign: "cm-search-de-vertrieb",
  content: "rsa-1",
  term: "crm vertrieb",
};
const UTM: [string, string][] = Object.entries(CAMPAIGN).map(([key, value]) => [`utm_${key}`, value]);
const COOKIE = "cm_ad_attribution";
const PAGES = [
  { slug: "crm-system", h1: "CRM-System für kleine Teams", faq: 4 },
  { slug: "crm-software", h1: "CRM-Software für kleine Teams", faq: 4 },
  { slug: "vertrieb", h1: "CRM für den Vertrieb kleiner Teams", faq: 4 },
  { slug: "angebote-nachfassen", h1: "Angebote nachfassen im CRM", faq: 4 },
  { slug: "statt-excel", h1: "Vom Excel-Blatt zum CRM", faq: 4 },
  { slug: "kundendatenbank", h1: "Kundendatenbank für Teams", faq: 4 },
  { slug: "crm-deutschland", h1: "CRM mit Datenbank in Frankfurt", faq: 4 },
  { slug: "preise", h1: "CRM ab 12 € pro Nutzer, Preise ohne Vertriebsgespräch", faq: 4 },
] as const;

function adLandingPath(slug: string) {
  return `/de/lp/${slug}`;
}
const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "phone", width: 390, height: 844 },
] as const;

function plain(value: string): string {
  return value.replace(/[  ]/gu, " ");
}

async function capturesLoaded(page: Page) {
  await expect
    .poll(() =>
      page
        .locator("[data-ad-landing-capture]")
        .evaluateAll((images) =>
          images.filter((image) => (image as HTMLImageElement).checkVisibility()).every((image) => {
            const img = image as HTMLImageElement;
            return img.complete && img.naturalWidth > 0;
          }),
        ),
    )
    .toBe(true);
}

async function screenshot(page: Page, testInfo: TestInfo, name: string) {
  const viewport = page.viewportSize();
  const height = await page.evaluate(() =>
    Math.max(
      document.documentElement.scrollHeight,
      ...[...document.querySelectorAll("body *")]
        .filter((element) => ["auto", "scroll"].includes(getComputedStyle(element).overflowY))
        .map((element) => element.scrollHeight),
    ),
  );
  const path = testInfo.outputPath(`${name}.png`);
  if (viewport) await page.setViewportSize({ width: viewport.width, height: Math.min(height, 12_000) });
  await capturesLoaded(page);
  await page.screenshot({ fullPage: true, path });
  if (viewport) await page.setViewportSize(viewport);
  await testInfo.attach(name, { contentType: "image/png", path });
}

async function attributionClicks(context: BrowserContext) {
  const cookie = (await context.cookies()).find((entry) => entry.name === COOKIE) as Cookie | undefined;
  if (!cookie) return null;
  const [payload] = cookie.value.split(".");
  return (JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { clicks: { kind: string; value: string }[] })
    .clicks;
}

test.describe("Google Search ad landing pages", () => {
  for (const { slug, h1, faq } of PAGES) {
    test(`${adLandingPath(slug)} answers the ad, stays out of search and shows one signup path`, async ({
      page,
    }, testInfo) => {
      const errors = collectPageErrors(page);
      await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
      const response = await page.goto(adLandingPath(slug));
      expect(response?.status()).toBe(200);

      await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /(?<!no)follow/);
      await expect(page.locator('link[rel="alternate"][hreflang]')).toHaveCount(0);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", new RegExp(`${adLandingPath(slug)}$`));

      expect(plain((await page.getByRole("heading", { level: 1 }).textContent()) ?? "")).toBe(
        h1,
      );
      await expect(page.locator("[data-ad-landing-audience]")).toHaveText("Für Teams von 2 bis 20 Personen");
      const price = page.locator("[data-ad-landing-price]");
      for (const plan of ["Starter", "Pro", "Business"]) await expect(price).toContainText(plan);
      expect(plain((await price.textContent()) ?? "")).toMatch(/12 €.*29 €.*69 €/su);
      await expect(page.locator("[data-ad-landing-signup]")).toHaveCount(2);
      for (const link of await page.locator("[data-ad-landing-signup]").all())
        await expect(link).toHaveAttribute("href", "/de/auth/signup?job=workspace");
      await expect(page.locator("[data-ad-landing-proof] > li")).toHaveCount(4);
      await expect(page.locator("#faq details")).toHaveCount(faq);

      for (const viewport of VIEWPORTS) {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await capturesLoaded(page);
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
        ).toBe(true);
        await screenshot(page, testInfo, `${slug}-${viewport.name}`);
      }
      expect(errors).toEqual([]);
    });
  }

  test("other locales, unknown slugs and the retired /start path return 404", async ({ request }) => {
    for (const path of ["/en/lp/crm-system", "/de/lp/unbekannt", "/de/start/crm-system"]) {
      const response = await request.get(path, { maxRedirects: 0 });
      expect(response.status(), path).toBe(404);
    }
  });
});

test.describe("campaign label from an ad landing page", () => {
  test.skip(e2eAppMode() !== "cloud", "The campaign label and ad attribution exist in the managed cloud only");

  test("all five utm values and the consented click id reach the new workspace, also via the demo link", async ({
    browser,
    database,
  }) => {
    test.setTimeout(240_000);
    const { baseUrl } = localE2eEnvironment();
    const secret = process.env.BETTER_AUTH_SECRET;
    if (!secret) throw new Error("A local authentication secret is required");
    const gclid = `Cj0KLp_${randomUUID().replaceAll("-", "")}`;
    const email = `lp-visitor-${randomUUID()}@example.test`;
    const context = await browser.newContext({ baseURL: baseUrl });
    await context.route(
      (url) =>
        !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) && !["data:", "blob:"].includes(url.protocol),
      (route) => route.abort("blockedbyclient"),
    );
    const page = await context.newPage();
    const errors = collectPageErrors(page);
    let authUserId: string | null = null;
    let companyId: string | null = null;

    try {
      await test.step("the landing asks for consent and keeps the click id after Allow", async () => {
        const search = new URLSearchParams([...UTM, ["gclid", gclid]]);
        await page.goto(`${adLandingPath("vertrieb")}?${search.toString()}`);
        const card = page.getByTestId("ad-attribution-consent-card");
        await expect(card).toBeVisible();
        await clickHydrated(
          card.getByRole("button", { name: germanMessages.AcquisitionConsent.allowAttribution, exact: true }),
        );
        await expect(card).not.toBeVisible();
        await expect.poll(() => attributionClicks(context)).toEqual([
          expect.objectContaining({ kind: "gclid", value: gclid }),
        ]);
        const url = new URL(page.url());
        expect(url.searchParams.get("gclid")).toBeNull();
        for (const [key, value] of UTM) expect(url.searchParams.get(key)).toBe(value);
      });

      await test.step("the demo link carries all five utm values", async () => {
        const demo = page.locator('[data-ad-landing-demo="hero"]');
        await expectHydrated(demo);
        await demo.dispatchEvent("contextmenu");
        const href = new URL((await demo.getAttribute("href")) as string);
        expect(href.host).toBe("demo.customermates.com");
        for (const [key, value] of UTM) expect(href.searchParams.get(key)).toBe(value);
      });

      await test.step("the second button opens the signup with the label", async () => {
        const button = page.locator('[data-ad-landing-signup="footer"]');
        await button.scrollIntoViewIfNeeded();
        await clickHydrated(button);
        await expect(page).toHaveURL(/\/de\/auth\/signup\?/);
        const url = new URL(page.url());
        expect(url.searchParams.get("job")).toBe("workspace");
        for (const [key, value] of UTM) expect(url.searchParams.get(key)).toBe(value);
      });

      await test.step("the email signup stores the campaign on the account", async () => {
        await expectHydrated(page.locator("#email"));
        await page.locator("#email").fill(email);
        await page.locator("#confirmEmail").fill(email);
        await page.locator("#password").fill("Lp-Visitor-Passw0rd!26");
        await page.locator("#confirmPassword").fill("Lp-Visitor-Passw0rd!26");
        await clickHydrated(page.getByRole("button", { name: germanMessages.SignUpForm.signUpCta, exact: true }));
        await expect
          .poll(async () => {
            const { rows } = await database.query<{ id: string; signupCampaign: string | null }>(
              'SELECT id,"signupCampaign" FROM "AuthUser" WHERE email=$1',
              [email],
            );
            return rows[0] ?? null;
          })
          .toEqual({ id: expect.any(String), signupCampaign: JSON.stringify(CAMPAIGN) });
        const { rows } = await database.query<{ id: string }>('SELECT id FROM "AuthUser" WHERE email=$1', [email]);
        authUserId = rows[0].id;
      });

      await test.step("the new workspace records the campaign and the Google click", async () => {
        await database.query('UPDATE "AuthUser" SET "emailVerified"=true WHERE id=$1', [authUserId]);
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
        await expectHydrated(page.locator("#firstName"));
        await page.locator("#firstName").fill("Lena");
        await page.locator("#lastName").fill("Visitor");
        await page.locator("#workspaceName").fill(`LP Journey ${randomUUID().slice(0, 8)}`);
        await page.locator("#agreeToTerms").click();
        await page.locator("#onboarding-team-size-small").click();
        await clickHydrated(page.getByRole("button", { name: englishMessages.OnboardingWizard.continue, exact: true }));
        await expect
          .poll(async () => {
            const { rows } = await database.query<{ id: string; signupCampaign: unknown }>(
              'SELECT id,"signupCampaign" FROM "Company" WHERE "createdByAuthUserId"=$1',
              [authUserId],
            );
            return rows.map((row) => row.signupCampaign);
          })
          .toEqual([CAMPAIGN]);
        const { rows } = await database.query<{ id: string }>(
          'SELECT id FROM "Company" WHERE "createdByAuthUserId"=$1',
          [authUserId],
        );
        companyId = rows[0].id;
        await expect
          .poll(async () => {
            const { rows: attribution } = await database.query<{ identifierKind: string; identifierValue: string }>(
              'SELECT "identifierKind","identifierValue" FROM "AdAttribution" WHERE "companyId"=$1',
              [companyId],
            );
            return attribution;
          })
          .toEqual([{ identifierKind: "gclid", identifierValue: gclid }]);
      });
      expect(errors).toEqual([]);
    } finally {
      await context.close();
      if (authUserId)
        await removeBrowserWorkspace(database, {
          companyId: (companyId ?? randomUUID()) as ReturnType<typeof randomUUID>,
          authUserId: authUserId as ReturnType<typeof randomUUID>,
          userId: randomUUID(),
          slug: "",
        });
    }
  });
});
