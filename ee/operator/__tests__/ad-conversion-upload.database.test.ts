import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it, vi } from "vitest";

const testEnv = vi.hoisted(() => ({ value: { DATABASE_URL: process.env.DATABASE_URL } as Record<string, unknown> }));

vi.mock("@/env", () => ({
  get env() {
    return testEnv.value;
  },
}));
vi.mock("@/core/decorators/operator-interactor.decorator", () => ({ OperatorInteractor: () => undefined }));

import type { DataManagerIngestBody } from "../data-manager/data-manager-request";
import type { DataManagerIngestOutcome } from "../data-manager/data-manager-transport";

import { AD_ATTRIBUTION_NOTICE_VERSION } from "@/constants/legal-documents";
import { runWithoutTenant } from "@/core/decorators/tenant-context";
import { unwrapValidated } from "@/core/validation/validation.utils";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { prisma } from "@/prisma/db";
import { PrismaAdConversionExportRepo } from "../prisma-ad-conversion-export.repository";
import { PrismaAdConversionUploadRepo } from "../prisma-ad-conversion-upload.repository";
import { UploadAdConversionsInteractor } from "../upload-ad-conversions.interactor";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;
const companyIds: string[] = [];

const configured = (ingest: boolean) => ({
  DATABASE_URL: process.env.DATABASE_URL,
  BETTER_AUTH_SECRET: "ledger-secret-ledger-secret-ledger-secret",
  GOOGLE_ADS_CONVERSION_UPLOAD_ENABLED: true,
  GOOGLE_ADS_CONVERSION_UPLOAD_INGEST: ingest,
  GOOGLE_ADS_OPERATING_ACCOUNT_ID: "1234567890",
  GOOGLE_ADS_SIGNUP_CONVERSION_ACTION_ID: "111",
  GOOGLE_ADS_PAID_CONVERSION_ACTION_ID: "222",
  GOOGLE_DATA_MANAGER_CLIENT_ID: "client-id",
  GOOGLE_DATA_MANAGER_CLIENT_SECRET: "client-secret",
  GOOGLE_DATA_MANAGER_REFRESH_TOKEN: "refresh-token",
});

function recordingTransport(outcome: DataManagerIngestOutcome) {
  const bodies: DataManagerIngestBody[] = [];
  return {
    bodies,
    accessToken: () => Promise.resolve("access-token"),
    ingest: (body: DataManagerIngestBody) => {
      bodies.push(body);
      return Promise.resolve(outcome);
    },
  };
}

const ACCEPTED: DataManagerIngestOutcome = { result: "accepted", httpStatus: 200, requestId: "request-1" };

async function upload(ingest: boolean, transport: ReturnType<typeof recordingTransport>) {
  testEnv.value = configured(ingest);
  const interactor = new UploadAdConversionsInteractor(
    new PrismaAdConversionExportRepo(),
    new PrismaAdConversionUploadRepo(),
    transport,
  );
  return runWithoutTenant(() => unwrapValidated(interactor.invoke()));
}

function gclidsSent(transport: ReturnType<typeof recordingTransport>, gclid: string) {
  return transport.bodies.flatMap((body) =>
    body.events.filter((event) => event.adIdentifiers.gclid === gclid).map((event) => event.destinationReferences[0]),
  );
}

async function seedAttributedWorkspace(gclid: string) {
  const companyId = randomUUID();
  companyIds.push(companyId);
  const clickedAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  await runWithoutTenant(async () => {
    await prisma.company.create({ data: { id: companyId } });
    const user = await prisma.user.create({
      data: {
        companyId,
        email: `ledger-${randomUUID()}@example.invalid`,
        firstName: "Ledger",
        lastName: "Owner",
        status: "active",
      },
    });
    await prisma.adAttribution.create({
      data: {
        companyId,
        userId: user.id,
        provider: "google_ads",
        identifierKind: "gclid",
        identifierValue: gclid,
        clickedAt,
        capturedAt: clickedAt,
        consentedAt: clickedAt,
        consentNoticeVersion: AD_ATTRIBUTION_NOTICE_VERSION,
        expiresAt: new Date(clickedAt.getTime() + 89 * 24 * 60 * 60 * 1000),
      },
    });
    await prisma.conversionEvent.create({
      data: { companyId, type: "signup", occurredAt: new Date(clickedAt.getTime() + 60 * 60 * 1000) },
    });
  });
  return companyId;
}

const ledgerOf = (companyId: string) =>
  runWithoutTenant(() =>
    prisma.adConversionUpload.findMany({
      where: { companyId },
      orderBy: { attemptedAt: "asc" },
      select: {
        provider: true,
        destination: true,
        conversionType: true,
        orderId: true,
        mode: true,
        status: true,
        httpStatus: true,
        errorStatus: true,
        requestId: true,
        settledAt: true,
      },
    }),
  );

afterAll(async () => {
  if (companyIds.length === 0) return;
  await runWithoutTenant(async () => {
    await prisma.adConversionUpload.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.adAttribution.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.conversionEvent.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.user.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
  });
});

describeDatabase("ad conversion upload ledger against a real database", { timeout: 120_000 }, () => {
  it("records validate-only runs without blocking, then blocks a conversion once Google accepted it", async () => {
    const gclid = `Cj0KLedger_${randomUUID().slice(0, 8)}`;
    const companyId = await seedAttributedWorkspace(gclid);

    const validating = recordingTransport(ACCEPTED);
    await upload(false, validating);
    await upload(false, validating);
    expect(gclidsSent(validating, gclid)).toEqual(["signup", "signup"]);
    expect(validating.bodies.every((body) => body.validateOnly)).toBe(true);

    const ingesting = recordingTransport(ACCEPTED);
    await upload(true, ingesting);
    await upload(true, ingesting);
    expect(gclidsSent(ingesting, gclid)).toEqual(["signup"]);
    expect(ingesting.bodies.every((body) => !body.validateOnly)).toBe(true);

    const rows = await ledgerOf(companyId);
    expect(rows.map((row) => [row.mode, row.status])).toEqual([
      ["validate", "accepted"],
      ["validate", "accepted"],
      ["ingest", "accepted"],
    ]);
    expect(new Set(rows.map((row) => row.orderId)).size).toBe(1);
    expect(rows[2]).toMatchObject({
      provider: "google_ads",
      destination: "google_ads:data_manager",
      conversionType: "signup",
      httpStatus: 200,
      requestId: "request-1",
      settledAt: expect.any(Date),
    });
    expect(JSON.stringify(rows)).not.toContain(gclid);
  });

  it("lets a rejected conversion be sent again but never resends one with an ambiguous answer", async () => {
    const rejectedGclid = `Cj0KRejected_${randomUUID().slice(0, 8)}`;
    const rejectedCompany = await seedAttributedWorkspace(rejectedGclid);

    await upload(true, recordingTransport({ result: "rejected", httpStatus: 400, errorStatus: "INVALID_ARGUMENT" }));
    const retried = recordingTransport(ACCEPTED);
    await upload(true, retried);
    expect(gclidsSent(retried, rejectedGclid)).toEqual(["signup"]);
    expect((await ledgerOf(rejectedCompany)).map((row) => [row.status, row.errorStatus])).toEqual([
      ["rejected", "INVALID_ARGUMENT"],
      ["accepted", null],
    ]);

    const ambiguousGclid = `Cj0KAmbiguous_${randomUUID().slice(0, 8)}`;
    const ambiguousCompany = await seedAttributedWorkspace(ambiguousGclid);
    await upload(true, recordingTransport({ result: "ambiguous", httpStatus: 503 }));
    const afterAmbiguous = recordingTransport(ACCEPTED);
    await upload(true, afterAmbiguous);
    expect(gclidsSent(afterAmbiguous, ambiguousGclid)).toEqual([]);
    expect((await ledgerOf(ambiguousCompany)).map((row) => [row.status, row.httpStatus])).toEqual([["ambiguous", 503]]);
  });

  it("deletes a workspace's ledger rows with the workspace", async () => {
    const companyId = await seedAttributedWorkspace(`Cj0KDeleted_${randomUUID().slice(0, 8)}`);
    await upload(false, recordingTransport(ACCEPTED));
    expect(await ledgerOf(companyId)).toHaveLength(1);

    await runWithoutTenant(async () => {
      await prisma.user.deleteMany({ where: { companyId } });
      await prisma.company.delete({ where: { id: companyId } });
    });
    expect(await ledgerOf(companyId)).toEqual([]);
  });
});
