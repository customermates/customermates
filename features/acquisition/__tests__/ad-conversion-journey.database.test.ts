import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("@/env", () => ({
  env: {
    APP_MODE: "cloud",
    DATABASE_URL: process.env.DATABASE_URL,
    BASE_URL: "http://localhost:4000",
    NODE_ENV: "test",
    BETTER_AUTH_SECRET: "journey-secret-journey-secret-journey-secret",
  },
}));
vi.mock("@/core/decorators/operator-interactor.decorator", () => ({ OperatorInteractor: () => undefined }));

import type { PublicAdAttributionCookie } from "../ad-attribution.schema";

import { runWithoutTenant } from "@/core/decorators/tenant-context";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createTestWorkspaceRegistration } from "@/tests/helpers/workspace-registration";
import { prisma } from "@/prisma/db";
import { PrismaBillingUsageRepo } from "@/features/billing-usage/prisma-billing-usage.repository";
import { PrismaCompanyRepo } from "@/features/company/prisma-company.repository";
import { GetAdConversionExportInteractor } from "@/ee/operator/get/get-ad-conversion-export.interactor";
import { PrismaAdConversionExportRepo } from "@/ee/operator/prisma-ad-conversion-export.repository";
import { googleAdsConversionCsv } from "@/ee/operator/ad-conversion-csv";
import { SubscriptionStatus } from "@/generated/prisma";
import { AdAttributionCookieRepo } from "../ad-attribution.repo";
import {
  adAttributionSigningSecret,
  decodePublicAdAttributionCookie,
  encodePublicAdAttributionCookie,
} from "../ad-attribution-cookie-codec";
import { registrationAdAttributionFromCookie } from "../ad-click-retention";
import { DecideAdAttributionConsentInteractor } from "../decide-ad-attribution-consent.interactor";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;
const signingSecret = adAttributionSigningSecret("journey-secret-journey-secret-journey-secret") as string;
const companyIds: string[] = [];

const signedCookieJar = () => {
  const jar = { value: undefined as string | undefined };
  const repo = new (class extends AdAttributionCookieRepo {
    readCookie() {
      return Promise.resolve(decodePublicAdAttributionCookie(jar.value, signingSecret));
    }

    writeCookie(value: PublicAdAttributionCookie) {
      jar.value = encodePublicAdAttributionCookie(value, signingSecret) ?? undefined;
      return Promise.resolve(jar.value !== undefined);
    }
  })();
  return { jar, repo };
};

async function landAndDecide(search: string, choice: "allow-attribution" | "necessary-only") {
  const { jar, repo } = signedCookieJar();
  const outcome = await new DecideAdAttributionConsentInteractor(repo).invoke({
    choice,
    visit: { pendingAt: new Date().toISOString(), search },
  });
  if (!outcome.ok) throw new Error("the consent decision failed validation");
  return { jar, decision: outcome.data };
}

async function registerFromCookie(cookieValue: string | undefined) {
  const cookie = decodePublicAdAttributionCookie(cookieValue, signingSecret);
  const owner = await runWithoutTenant(() =>
    createTestWorkspaceRegistration().createCompanyAndUser({
      email: `ad-journey-${randomUUID()}@example.com`,
      firstName: "Ad",
      lastName: "Journey",
      agreeToTerms: true,
      avatarUrl: null,
      adAttribution: cookie ? registrationAdAttributionFromCookie(cookie, new Date()) : [],
    }),
  );
  companyIds.push(owner.companyId);
  return owner;
}

async function becomePaying(companyId: string, lemonSqueezyId: string) {
  return new PrismaCompanyRepo(new PrismaBillingUsageRepo()).writeSubscriptionUnscoped({
    companyId,
    expectedLemonSqueezyId: null,
    lemonSqueezyId,
    status: SubscriptionStatus.active,
    plan: "business",
    quantity: 1,
  });
}

async function replayPaying(companyId: string, lemonSqueezyId: string) {
  return new PrismaCompanyRepo(new PrismaBillingUsageRepo()).writeSubscriptionUnscoped({
    companyId,
    expectedLemonSqueezyId: lemonSqueezyId,
    lemonSqueezyId,
    status: SubscriptionStatus.active,
    plan: "business",
    quantity: 1,
  });
}

const conversionsOf = (companyId: string) =>
  runWithoutTenant(() =>
    prisma.conversionEvent.findMany({
      where: { companyId },
      orderBy: { type: "asc" },
      select: { type: true, occurredAt: true },
    }),
  );

const attributionsOf = (companyId: string) =>
  runWithoutTenant(() =>
    prisma.adAttribution.findMany({
      where: { companyId },
      select: { provider: true, identifierKind: true, identifierValue: true },
    }),
  );

afterAll(async () => {
  if (companyIds.length === 0) return;
  await runWithoutTenant(async () => {
    await prisma.adAttribution.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.conversionEvent.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.user.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
  });
});

describeDatabase("consented ad click journey against a real database", { timeout: 120_000 }, () => {
  it("carries one allowed gclid from the landing through signup and first payment into the export", async () => {
    const gclid = `Cj0KJourney_${randomUUID().slice(0, 8)}`;
    const { jar, decision } = await landAndDecide(`?gclid=${gclid}`, "allow-attribution");

    expect(decision).toMatchObject({ advertising: true });
    expect(jar.value).toMatch(/^[A-Za-z0-9_-]+\.[0-9a-f]{64}$/);
    expect(decodePublicAdAttributionCookie(`${jar.value}0`, signingSecret)).toBeNull();
    expect(decodePublicAdAttributionCookie(jar.value, signingSecret)?.clicks).toEqual([
      expect.objectContaining({ provider: "google_ads", kind: "gclid", value: gclid }),
    ]);

    const owner = await registerFromCookie(jar.value);
    expect(await attributionsOf(owner.companyId)).toEqual([
      { provider: "google_ads", identifierKind: "gclid", identifierValue: gclid },
    ]);
    expect((await conversionsOf(owner.companyId)).map((row) => row.type)).toEqual(["signup"]);

    const subscriptionId = `ls-${randomUUID()}`;
    await expect(becomePaying(owner.companyId, subscriptionId)).resolves.toBe(true);
    const afterPayment = await conversionsOf(owner.companyId);
    expect(afterPayment.map((row) => row.type)).toEqual(["signup", "paid"]);

    await expect(replayPaying(owner.companyId, subscriptionId)).resolves.toBe(true);
    await expect(replayPaying(owner.companyId, subscriptionId)).resolves.toBe(true);
    expect(await conversionsOf(owner.companyId)).toEqual(afterPayment);

    const exported = await runWithoutTenant(() =>
      new GetAdConversionExportInteractor(new PrismaAdConversionExportRepo()).invoke(),
    );
    if (!exported.ok) throw new Error("the export failed");
    const mine = exported.data.rows.filter((row) => row.identifierValue === gclid);
    expect(mine.map((row) => row.conversionType).sort()).toEqual(["paid", "signup"]);
    expect(new Set(mine.map((row) => row.orderId)).size).toBe(2);
    const lines = googleAdsConversionCsv(exported.data)
      .split("\n")
      .filter((line) => line.startsWith(`${gclid},`));
    expect(lines).toHaveLength(2);
    expect(googleAdsConversionCsv(exported.data)).not.toContain(owner.companyId);
  });

  it("writes nothing for a refusal, even after the workspace starts paying", async () => {
    const gclid = `Cj0KRefused_${randomUUID().slice(0, 8)}`;
    const { jar, decision } = await landAndDecide(`?gclid=${gclid}`, "necessary-only");

    expect(decision).toMatchObject({ advertising: false });
    expect(decodePublicAdAttributionCookie(jar.value, signingSecret)?.clicks).toEqual([]);
    expect(Buffer.from((jar.value ?? "").split(".")[0], "base64url").toString("utf8")).not.toContain(gclid);

    const owner = await registerFromCookie(jar.value);
    await becomePaying(owner.companyId, `ls-${randomUUID()}`);
    expect(await attributionsOf(owner.companyId)).toEqual([]);
    expect(await conversionsOf(owner.companyId)).toEqual([]);
  });

  it("writes nothing for a landing that carries two click identifiers", async () => {
    const { jar } = await landAndDecide(
      `?gclid=Cj0KTwo_${randomUUID().slice(0, 8)}&gbraid=0AAA${randomUUID().slice(0, 8)}`,
      "allow-attribution",
    );

    expect(decodePublicAdAttributionCookie(jar.value, signingSecret)?.clicks).toEqual([]);

    const owner = await registerFromCookie(jar.value);
    await becomePaying(owner.companyId, `ls-${randomUUID()}`);
    expect(await attributionsOf(owner.companyId)).toEqual([]);
    expect(await conversionsOf(owner.companyId)).toEqual([]);
  });
});
