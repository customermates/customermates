import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runWithTenant } from "@/core/decorators/tenant-context";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createMockUser } from "@/tests/helpers/mock-user";
import { PermissionService } from "@/core/base/permission.service";
import { PrismaUserRepo } from "@/features/user/prisma-user.repository";
import { readOnboardingWizardProgress } from "../onboarding-wizard-progress.schema";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase("durable onboarding progress on PostgreSQL", () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const companyId = randomUUID();
  const otherCompanyId = randomUUID();
  const userId = randomUUID();
  const colleagueId = randomUUID();
  const outsiderId = randomUUID();
  const tenant = (id = userId, company = companyId) =>
    createMockUser({ id, companyId: company, onboardingWizardCompletedAt: null });
  const progress = {
    ...readOnboardingWizardProgress(null),
    step: "ai" as const,
    inviteTab: "email" as const,
    ai: {
      ...readOnboardingWizardProgress(null).ai,
      route: { screen: "claude" as const },
      selectedProvider: "claude" as const,
      claudeMethod: "account" as const,
    },
  };

  beforeAll(async () => {
    await client.connect();
    await client.query(
      'INSERT INTO "Company" ("id", "updatedAt") VALUES ($1, CURRENT_TIMESTAMP), ($2, CURRENT_TIMESTAMP)',
      [companyId, otherCompanyId],
    );
    for (const [id, company] of [
      [userId, companyId],
      [colleagueId, companyId],
      [outsiderId, otherCompanyId],
    ]) {
      await client.query(
        'INSERT INTO "User" ("id", "email", "firstName", "lastName", "companyId", "status", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)',
        [id, `${id}@example.invalid`, "Onboarding", "Tester", company, "active"],
      );
    }
  });

  afterAll(async () => {
    await client.query('DELETE FROM "User" WHERE "companyId" IN ($1, $2)', [companyId, otherCompanyId]);
    await client.query('DELETE FROM "Company" WHERE "id" IN ($1, $2)', [companyId, otherCompanyId]);
    await client.end();
  });

  it("restores progress through a fresh repository and fresh tenant context", async () => {
    expect(
      await runWithTenant(tenant(), () =>
        new PrismaUserRepo(new PermissionService()).saveOnboardingWizardProgress(progress),
      ),
    ).toBe(true);
    expect(
      await runWithTenant(tenant(), () =>
        new PrismaUserRepo(new PermissionService()).findOnboardingWizardProgressOrThrow(),
      ),
    ).toEqual(progress);
  });

  it("keeps another member and another workspace independent", async () => {
    expect(
      await runWithTenant(tenant(colleagueId), () =>
        new PrismaUserRepo(new PermissionService()).findOnboardingWizardProgressOrThrow(),
      ),
    ).toBeNull();
    expect(
      await runWithTenant(tenant(outsiderId, otherCompanyId), () =>
        new PrismaUserRepo(new PermissionService()).findOnboardingWizardProgressOrThrow(),
      ),
    ).toBeNull();
    expect(
      await runWithTenant(tenant(userId, otherCompanyId), () =>
        new PrismaUserRepo(new PermissionService()).saveOnboardingWizardProgress(progress),
      ),
    ).toBe(false);
    await expect(
      runWithTenant(tenant(userId, otherCompanyId), () =>
        new PrismaUserRepo(new PermissionService()).findOnboardingWizardProgressOrThrow(),
      ),
    ).rejects.toThrow();
  });

  it("preserves navigation choices backwards as well as forwards", async () => {
    const backwards = { ...progress, step: "invite" as const };
    await runWithTenant(tenant(), () =>
      new PrismaUserRepo(new PermissionService()).saveOnboardingWizardProgress(backwards),
    );
    expect(
      await runWithTenant(tenant(), () =>
        new PrismaUserRepo(new PermissionService()).findOnboardingWizardProgressOrThrow(),
      ),
    ).toEqual(backwards);
  });

  it("keeps completion final even when an older tab saves afterward", async () => {
    await runWithTenant(tenant(), () =>
      new PrismaUserRepo(new PermissionService()).markOnboardingWizardCompleted({ userId }),
    );
    expect(
      await runWithTenant(tenant(), () =>
        new PrismaUserRepo(new PermissionService()).saveOnboardingWizardProgress(progress),
      ),
    ).toBe(false);
    const { rows } = await client.query(
      'SELECT "onboardingWizardCompletedAt", "onboardingWizardProgress" FROM "User" WHERE "id" = $1',
      [userId],
    );
    expect(rows[0].onboardingWizardCompletedAt).toBeInstanceOf(Date);
    expect(rows[0].onboardingWizardProgress.step).toBe("invite");
  });
});
