import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runWithTenant, runWithoutTenant } from "@/core/decorators/tenant-context";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createMockUser } from "@/tests/helpers/mock-user";
import { PrismaCompanyRepo } from "@/features/company/prisma-company.repository";
import { PrismaBillingUsageRepo } from "@/features/billing-usage/prisma-billing-usage.repository";
import { PrismaOnboardingFunnelRepo } from "../prisma-onboarding-funnel.repository";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase("onboarding funnel events and signup source on PostgreSQL", () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const companyId = randomUUID();
  const otherCompanyId = randomUUID();
  const tenant = (company = companyId) => createMockUser({ id: randomUUID(), companyId: company });
  const repo = new PrismaOnboardingFunnelRepo();

  beforeAll(async () => {
    await client.connect();
    await client.query(
      'INSERT INTO "Company" ("id", "updatedAt") VALUES ($1, CURRENT_TIMESTAMP), ($2, CURRENT_TIMESTAMP)',
      [companyId, otherCompanyId],
    );
  });

  afterAll(async () => {
    await client.query('DELETE FROM "Company" WHERE "id" IN ($1, $2)', [companyId, otherCompanyId]);
    await client.end();
  });

  it("stores the signup source once per company and reads its job for the preselection", async () => {
    const companies = new PrismaCompanyRepo(new PrismaBillingUsageRepo());
    const source = {
      job: "followup" as const,
      landingPath: "/en/consultants",
      referrerHost: null,
      utmSource: null,
      utmMedium: null,
      utmCampaign: null,
      marketingConsentedAt: null,
      capturedAt: new Date("2026-11-06T08:00:00.000Z"),
    };
    await runWithTenant(tenant(), () => companies.recordSignupSource(companyId, source));
    await runWithTenant(tenant(), () => companies.recordSignupSource(companyId, { ...source, job: "agent" }));

    const rows = await client.query('SELECT "job", "landingPath" FROM "CompanySignupSource" WHERE "companyId"=$1', [
      companyId,
    ]);
    expect(rows.rows).toEqual([{ job: "followup", landingPath: "/en/consultants" }]);
    await expect(runWithTenant(tenant(), () => repo.findOnboardingJobChoice())).resolves.toEqual({
      selectedJob: null,
      signupJob: "followup",
      signupLandingPath: "/en/consultants",
      discoveryResolved: false,
      teamSize: null,
    });
  });

  it("records each funnel event once with its first real time and carries the latest chosen job", async () => {
    const chosenAt = new Date("2026-11-06T09:00:00.000Z");
    await expect(
      runWithTenant(tenant(), () =>
        repo.recordFunnelEvent({ type: "jobSelected", occurredAt: chosenAt, job: "agent" }),
      ),
    ).resolves.toBe(true);
    await expect(
      runWithTenant(tenant(), () =>
        repo.recordFunnelEvent({ type: "jobSelected", occurredAt: new Date(), job: "workspace" }),
      ),
    ).resolves.toBe(false);

    const connectedAt = new Date("2026-11-06T09:30:00.000Z");
    await expect(
      runWithoutTenant(() =>
        repo.recordFunnelEventUnscoped({ companyId, type: "channelConnected", occurredAt: connectedAt }),
      ),
    ).resolves.toBe(true);
    await expect(
      runWithoutTenant(() =>
        repo.recordFunnelEventUnscoped({ companyId, type: "channelConnected", occurredAt: new Date() }),
      ),
    ).resolves.toBe(false);

    const rows = await client.query(
      'SELECT "type", "job", "occurredAt" FROM "CompanyFunnelEvent" WHERE "companyId"=$1 ORDER BY "occurredAt"',
      [companyId],
    );
    expect(rows.rows).toEqual([
      { type: "jobSelected", job: "workspace", occurredAt: chosenAt },
      { type: "channelConnected", job: "workspace", occurredAt: connectedAt },
    ]);
    await expect(runWithTenant(tenant(), () => repo.findOnboardingJobChoice())).resolves.toEqual({
      selectedJob: "workspace",
      signupJob: "followup",
      signupLandingPath: "/en/consultants",
      discoveryResolved: false,
      teamSize: null,
    });
  });

  it("keeps funnel events inside their workspace", async () => {
    await expect(runWithTenant(tenant(otherCompanyId), () => repo.findOnboardingJobChoice())).resolves.toEqual({
      selectedJob: null,
      signupJob: null,
      signupLandingPath: null,
      discoveryResolved: false,
      teamSize: null,
    });
    await runWithTenant(tenant(otherCompanyId), () =>
      repo.recordFunnelEvent({ type: "agentConnected", occurredAt: new Date() }),
    );
    const rows = await client.query('SELECT "companyId", "job" FROM "CompanyFunnelEvent" WHERE "type"=$1', [
      "agentConnected",
    ]);
    expect(rows.rows).toEqual([{ companyId: otherCompanyId, job: null }]);
  });

  it("stores the discovery answer once and treats the question as resolved for the same login's other workspaces", async () => {
    const companies = new PrismaCompanyRepo(new PrismaBillingUsageRepo());
    const loginId = randomUUID();
    await client.query('UPDATE "Company" SET "createdByAuthUserId"=$1 WHERE "id" IN ($2, $3)', [
      loginId,
      companyId,
      otherCompanyId,
    ]);
    const owner = tenant();

    await expect(
      runWithTenant(owner, () =>
        companies.recordDiscoveryAnswer({ userId: owner.id, choice: "other", detail: "a podcast" }),
      ),
    ).resolves.toBe(true);
    await expect(
      runWithTenant(owner, () =>
        companies.recordDiscoveryAnswer({ userId: owner.id, choice: "searchEngine", detail: null }),
      ),
    ).resolves.toBe(false);

    const stored = await client.query(
      'SELECT "discoveryChoice", "discoveryDetail", "discoveryUserId" FROM "Company" WHERE "id"=$1',
      [companyId],
    );
    expect(stored.rows).toEqual([
      { discoveryChoice: "other", discoveryDetail: "a podcast", discoveryUserId: owner.id },
    ]);
    await expect(runWithTenant(owner, () => repo.findOnboardingJobChoice())).resolves.toMatchObject({
      discoveryResolved: true,
    });
    await expect(runWithTenant(tenant(otherCompanyId), () => repo.findOnboardingJobChoice())).resolves.toMatchObject({
      discoveryResolved: true,
    });

    await client.query('UPDATE "Company" SET "createdByAuthUserId"=NULL WHERE "id"=$1', [otherCompanyId]);
    await expect(runWithTenant(tenant(otherCompanyId), () => repo.findOnboardingJobChoice())).resolves.toMatchObject({
      discoveryResolved: false,
      teamSize: null,
    });
  });
});
