import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("@/core/decorators/operator-interactor.decorator", () => ({ OperatorInteractor: () => undefined }));
vi.mock("@/core/decorators/validate-output.decorator", () => ({ ValidateOutput: () => undefined }));

import { runWithoutTenant } from "@/core/decorators/tenant-context";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { prisma } from "@/prisma/db";
import { googleAdsConversionCsv } from "../ad-conversion-csv";
import { GetAdConversionExportInteractor } from "../get/get-ad-conversion-export.interactor";
import { PrismaAdConversionExportRepo } from "../prisma-ad-conversion-export.repository";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

const companyIds: string[] = [];

afterAll(async () => {
  if (companyIds.length === 0) return;
  await runWithoutTenant(async () => {
    await prisma.adAttribution.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.conversionEvent.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.user.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
  });
});

async function seedAttributedConversion(args: {
  provider: string;
  identifierKind: string;
  identifierValue: string;
  clickedAt: Date;
  conversions: Array<{ type: "signup" | "paid"; occurredAt: Date }>;
}) {
  const companyId = randomUUID();
  companyIds.push(companyId);

  await runWithoutTenant(async () => {
    await prisma.company.create({ data: { id: companyId } });
    const user = await prisma.user.create({
      data: {
        companyId,
        email: `export-${randomUUID()}@example.invalid`,
        firstName: "Export",
        lastName: "Owner",
        status: "active",
      },
    });
    await prisma.adAttribution.create({
      data: {
        companyId,
        userId: user.id,
        provider: args.provider,
        identifierKind: args.identifierKind,
        identifierValue: args.identifierValue,
        clickedAt: args.clickedAt,
        capturedAt: args.clickedAt,
        consentedAt: args.clickedAt,
        consentNoticeVersion: "2026-09-02",
        expiresAt: new Date(args.clickedAt.getTime() + 89 * 24 * 60 * 60 * 1000),
      },
    });
    for (const conversion of args.conversions) {
      await prisma.conversionEvent.create({
        data: { companyId, type: conversion.type, occurredAt: conversion.occurredAt },
      });
    }
  });

  return companyId;
}

describeDatabase("ad conversion export against a real database", { timeout: 120_000 }, () => {
  it("produces an uploadable Google file from stored attribution and conversions", async () => {
    const now = new Date();
    const clickedAt = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
    const gclid = `Cj0K_${randomUUID().slice(0, 8)}`;
    const oppref = `Opaque_${randomUUID().slice(0, 8)}`;

    const googleCompany = await seedAttributedConversion({
      provider: "google_ads",
      identifierKind: "gclid",
      identifierValue: gclid,
      clickedAt,
      conversions: [
        { type: "signup", occurredAt: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
        { type: "paid", occurredAt: new Date(now.getTime() - 60 * 60 * 1000) },
      ],
    });
    await seedAttributedConversion({
      provider: "openai_ads",
      identifierKind: "oppref",
      identifierValue: oppref,
      clickedAt,
      conversions: [{ type: "signup", occurredAt: new Date(now.getTime() - 24 * 60 * 60 * 1000) }],
    });

    const interactor = new GetAdConversionExportInteractor(new PrismaAdConversionExportRepo());
    const outcome = await runWithoutTenant(() => interactor.invoke(now));
    if (!("data" in outcome)) throw new Error("export failed validation");

    const mine = outcome.data.rows.filter((row) => row.identifierValue === gclid);
    expect(mine.map((row) => row.conversionType).sort()).toEqual(["paid", "signup"]);

    const csv = googleAdsConversionCsv(outcome.data).split("\n");
    expect(csv[0]).toBe("Parameters:TimeZone=+0000");
    expect(csv[1]).toBe("Google Click ID,Conversion Name,Conversion Time,Order ID,Ad User Data,Ad Personalization");

    const rows = csv.filter((line) => line.startsWith(gclid));
    expect(rows).toHaveLength(2);
    for (const line of rows) {
      expect(line).toMatch(
        /^Cj0K_[0-9a-f]{8},Customermates (signup|paid),\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\+0000,[0-9a-f]{32},Granted,Denied$/,
      );
    }

    const orderIds = rows.map((line) => line.split(",")[3]);
    expect(new Set(orderIds).size).toBe(2);
    expect(csv.join("\n")).not.toContain(googleCompany);
    expect(csv.join("\n")).not.toContain(oppref);
  });

  it("omits a conversion whose Google click has passed its reporting window", async () => {
    const now = new Date();
    const staleGclid = `Cj0K_${randomUUID().slice(0, 8)}`;
    await seedAttributedConversion({
      provider: "google_ads",
      identifierKind: "gclid",
      identifierValue: staleGclid,
      clickedAt: new Date(now.getTime() - 95 * 24 * 60 * 60 * 1000),
      conversions: [{ type: "signup", occurredAt: new Date(now.getTime() - 94 * 24 * 60 * 60 * 1000) }],
    });

    const interactor = new GetAdConversionExportInteractor(new PrismaAdConversionExportRepo());
    const outcome = await runWithoutTenant(() => interactor.invoke(now));
    if (!("data" in outcome)) throw new Error("export failed validation");

    expect(googleAdsConversionCsv(outcome.data)).not.toContain(staleGclid);
  });
});
