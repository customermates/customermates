import { randomUUID } from "node:crypto";

import { describe, it, expect, afterAll, vi } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import type { LegalNoticeAuditPayload } from "@/features/legal/legal-audit.schema";
import type { TenantUser } from "@/features/user/user.schema";

import { createTranslator } from "next-intl";

import messages from "@/i18n/locales/en.json";

const activeTenantUser = vi.hoisted(() => ({
  value: null as TenantUser | null,
}));

vi.mock("next-intl/server", () => ({
  getLocale: () => Promise.resolve("en"),
  getTranslations: () => Promise.resolve(createTranslator({ locale: "en", messages })),
}));
vi.mock("@/env", () => ({
  env: {
    APP_MODE: "cloud",
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: "test",
  },
}));
vi.mock("@/core/di", () => ({
  getUserService: () => ({
    getActiveUserOrThrow: () => {
      if (!activeTenantUser.value) throw new Error("No active tenant user configured for the test");
      return Promise.resolve(activeTenantUser.value);
    },
  }),
}));

const { PrismaUserRepo } = await import("@/features/user/prisma-user.repository");
const { RegisterUserInteractor } = await import("@/features/user/register/register-user.interactor");
const { EventService } = await import("@/features/event/event.service");
const { DomainEventListener } = await import("@/features/event/domain-event.listener");
const { DomainEvent } = await import("@/features/event/domain-events");
const { PrismaAuditLogRepo } = await import("@/features/audit-log/prisma-audit-log.repository");
const { GetLegalStatusInteractor } = await import("@/features/legal/get-legal-status.interactor");
const { AcceptLegalDocumentsInteractor } = await import("@/features/legal/accept-legal-documents.interactor");
const { currentLegalDocumentVersions } = await import("@/constants/legal-documents");
const { prisma } = await import("@/prisma/db");
const { runWithTenant, runWithoutTenant } = await import("@/core/decorators/tenant-context");
const { runInTransaction } = await import("@/core/decorators/transaction-runner");
const { runWithOperator } = await import("@/core/decorators/operator-context");
const { PrismaOperatorRepo } = await import("@/ee/operator/prisma-operator.repository");

const email = `real-db-check-${Date.now()}@example.com`;
const companyIds: string[] = [];
const authUserIds: string[] = [];
const operatorActorIds: string[] = [];

async function hasBlockedDatabaseSession(blockerPid: number): Promise<boolean> {
  const [row] = await prisma.$queryRaw<Array<{ blocked: boolean }>>`
    SELECT EXISTS (
      SELECT 1
      FROM pg_stat_activity activity
      WHERE ${blockerPid} = ANY(pg_blocking_pids(activity.pid))
    ) AS blocked
  `;

  return Boolean(row?.blocked);
}

async function waitForBlockedDatabaseSession(blockerPid: number): Promise<boolean> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await hasBlockedDatabaseSession(blockerPid)) return true;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  return false;
}

function unregisteredRouteGuardService(id: string, sessionEmail: string) {
  return {
    resolveAccountState: vi.fn().mockResolvedValue({
      state: "unregistered",
      sessionUser: {
        createdAt: new Date(0),
        email: sessionEmail,
        emailVerified: true,
        id,
      },
      user: null,
      emailVerified: true,
      legalStatus: null,
      subscription: null,
    }),
  };
}

function newEventService() {
  return new EventService(
    [],
    {
      getWebhooksForEvent: vi.fn().mockResolvedValue([]),
      getWebhooksForEventUnscoped: vi.fn().mockResolvedValue([]),
    },
    {
      create: vi.fn().mockResolvedValue([]),
      createUnscoped: vi.fn().mockResolvedValue([]),
    },
    new PrismaAuditLogRepo(),
    { dispatch: vi.fn().mockResolvedValue(undefined) } as never,
  );
}

afterAll(async () => {
  await runWithoutTenant(() =>
    prisma.operatorAuditEvent.deleteMany({ where: { actorUserId: { in: operatorActorIds } } }),
  );
  for (const authUserId of authUserIds)
    await runWithoutTenant(() => prisma.authUser.deleteMany({ where: { id: authUserId } }));
  for (const companyId of companyIds)
    await runWithoutTenant(() => prisma.company.deleteMany({ where: { id: companyId } }));
  await prisma.$disconnect();
});

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase("registration against a real database", () => {
  it("provisions a workspace with default select fields and no demo records", async () => {
    const repo = new PrismaUserRepo();
    const user = await runWithoutTenant(() =>
      repo.createCompanyAndUser({
        email,
        firstName: "Real",
        lastName: "Check",
        country: "de",
        agreeToTerms: true,
        avatarUrl: null,
      }),
    );

    companyIds.push(user.companyId);
    const companyId = user.companyId;

    const columns = await runWithoutTenant(() =>
      prisma.customColumn.findMany({
        where: { companyId },
        orderBy: { createdAt: "asc" },
      }),
    );

    expect(columns.map((column) => [column.entityType, column.label])).toEqual([
      ["contact", "Sales Pipeline"],
      ["deal", "Stage"],
      ["task", "Status"],
    ]);

    const company = await runWithoutTenant(() =>
      prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { dealWeightingColumnId: true } }),
    );
    const dealColumn = columns.find((column) => column.entityType === "deal");

    expect(company.dealWeightingColumnId).toBe(dealColumn?.id);

    const stages = (dealColumn?.options as { options: { weight?: number; isDefault: boolean }[] }).options;

    expect(stages.map((stage) => stage.weight)).toEqual([10, 20, 40, 60, 80, 100, 0]);
    expect(stages.filter((stage) => stage.isDefault)).toHaveLength(1);

    const counts = await runWithoutTenant(() =>
      Promise.all([
        prisma.contact.count({ where: { companyId } }),
        prisma.organization.count({ where: { companyId } }),
        prisma.deal.count({ where: { companyId } }),
        prisma.service.count({ where: { companyId } }),
        prisma.task.count({ where: { companyId } }),
      ]),
    );

    expect(counts).toEqual([0, 0, 0, 0, 0]);

    const persistedUser = await runWithoutTenant(() =>
      prisma.user.findUniqueOrThrow({
        where: { id: user.id },
        select: { agreeToTerms: true },
      }),
    );

    expect(persistedUser).toEqual({ agreeToTerms: true });
  });

  it("stores one attribution row per provider transactionally and deletes them at each provider's expiry", async () => {
    const repo = new PrismaUserRepo();
    const clickedAt = new Date("2026-08-31T09:55:00.000Z");
    const capturedAt = new Date("2026-08-31T10:00:00.000Z");
    const googleExpiresAt = new Date("2026-11-28T10:00:00.000Z");
    const openAiExpiresAt = new Date("2026-09-30T10:00:00.000Z");
    const owner = await runWithoutTenant(() =>
      repo.createCompanyAndUser({
        email: `ad-click-${Date.now()}@example.com`,
        firstName: "Ad",
        lastName: "Click",
        country: "de",
        agreeToTerms: true,
        avatarUrl: null,
        adAttribution: [
          {
            provider: "google_ads",
            identifierKind: "gclid",
            identifierValue: "Case-Sensitive_GCLID",
            clickedAt,
            capturedAt,
            consentedAt: capturedAt,
            consentNoticeVersion: "2026-09-02",
            expiresAt: googleExpiresAt,
          },
          {
            provider: "openai_ads",
            identifierKind: "oppref",
            identifierValue: "Opaque-OPPREF",
            clickedAt,
            capturedAt,
            consentedAt: capturedAt,
            consentNoticeVersion: "2026-09-02",
            expiresAt: openAiExpiresAt,
          },
        ],
      }),
    );
    companyIds.push(owner.companyId);

    await expect(
      runWithoutTenant(() =>
        prisma.adAttribution.findMany({
          where: { companyId: owner.companyId },
          orderBy: { provider: "asc" },
          select: { provider: true, identifierKind: true, identifierValue: true, clickedAt: true, userId: true },
        }),
      ),
    ).resolves.toEqual([
      {
        provider: "google_ads",
        identifierKind: "gclid",
        identifierValue: "Case-Sensitive_GCLID",
        clickedAt,
        userId: owner.id,
      },
      {
        provider: "openai_ads",
        identifierKind: "oppref",
        identifierValue: "Opaque-OPPREF",
        clickedAt,
        userId: owner.id,
      },
    ]);

    await expect(
      runWithoutTenant(() =>
        prisma.conversionEvent.findMany({ where: { companyId: owner.companyId }, select: { type: true } }),
      ),
    ).resolves.toEqual([{ type: "signup" }]);

    await expect(repo.expireAdAttributionUnscoped(new Date("2026-09-30T09:59:59.000Z"))).resolves.toBe(0);
    await expect(repo.expireAdAttributionUnscoped(openAiExpiresAt)).resolves.toBe(1);
    await expect(
      runWithoutTenant(() =>
        prisma.adAttribution.findMany({ where: { companyId: owner.companyId }, select: { provider: true } }),
      ),
    ).resolves.toEqual([{ provider: "google_ads" }]);

    await expect(runWithTenant(owner, () => repo.clearAdAttributionForUser({ userId: owner.id }))).resolves.toBe(true);
    await expect(
      runWithoutTenant(() => prisma.adAttribution.count({ where: { companyId: owner.companyId } })),
    ).resolves.toBe(0);
    await expect(runWithTenant(owner, () => repo.clearAdAttributionForUser({ userId: owner.id }))).resolves.toBe(false);

    await expect(
      runWithoutTenant(() =>
        prisma.user.findUniqueOrThrow({ where: { id: owner.id }, select: { onboardingWizardCompletedAt: true } }),
      ),
    ).resolves.toEqual({ onboardingWizardCompletedAt: null });
  });

  it("atomically creates a new cloud company and its initial legal audit evidence", async () => {
    const registrationEmail = `legal-registration-${Date.now()}@example.com`;
    const authUserId = `auth-${Date.now()}`;
    const authService = {
      sendNewUserNotificationEmail: vi.fn().mockResolvedValue(undefined),
    };
    await runWithoutTenant(() =>
      prisma.authUser.create({
        data: { id: authUserId, name: "Legal Evidence", email: registrationEmail, companyId: null },
      }),
    );
    authUserIds.push(authUserId);
    const eventService = new EventService(
      [],
      {
        getWebhooksForEvent: vi.fn().mockResolvedValue([]),
        getWebhooksForEventUnscoped: vi.fn().mockResolvedValue([]),
      },
      {
        create: vi.fn().mockResolvedValue([]),
        createUnscoped: vi.fn().mockResolvedValue([]),
      },
      new PrismaAuditLogRepo(),
      { dispatch: vi.fn().mockResolvedValue(undefined) } as never,
    );
    const interactor = new RegisterUserInteractor(
      authService as never,
      new PrismaUserRepo(),
      eventService,
      unregisteredRouteGuardService(authUserId, registrationEmail) as never,
    );

    const result = await interactor.invoke(
      {
        email: registrationEmail,
        firstName: "Legal",
        lastName: "Evidence",
        country: "de",
        agreeToTerms: true,
        avatarUrl: null,
      },
      { target: { type: "createCompany" } },
    );
    expect(result).toEqual({
      ok: true,
      data: { redirectTo: "/onboarding/wizard" },
    });

    const user = await runWithoutTenant(() => prisma.user.findUniqueOrThrow({ where: { email: registrationEmail } }));
    companyIds.push(user.companyId);
    expect(
      await runWithoutTenant(() =>
        prisma.authUser.findUniqueOrThrow({ where: { id: authUserId }, select: { companyId: true } }),
      ),
    ).toEqual({ companyId: user.companyId });
    const acceptance = await runWithoutTenant(() =>
      prisma.auditLog.findFirstOrThrow({
        where: {
          companyId: user.companyId,
          entityId: user.companyId,
          event: DomainEvent.LEGAL_DOCUMENTS_ACCEPTED,
          userId: user.id,
        },
      }),
    );
    const eventData = acceptance.eventData as {
      payload: {
        acceptanceType: string;
        acceptingEmail: string;
      };
    };

    expect(eventData.payload).toMatchObject({
      acceptanceType: "initial-onboarding",
      acceptingEmail: registrationEmail,
    });

    const noticePayload: LegalNoticeAuditPayload = {
      versions: currentLegalDocumentVersions(),
      changedDocuments: ["terms", "dpa", "privacy", "subprocessors"],
      recipientEmail: user.email,
      effectiveAt: "2026-08-21T09:00:00.000Z",
    };
    await runWithoutTenant(() =>
      runInTransaction(
        async () => {
          await eventService.publish(
            DomainEvent.LEGAL_NOTICE_SENT,
            { entityId: user.id, payload: noticePayload },
            { systemCompanyId: user.companyId, systemUserId: user.id },
          );
        },
        { companyId: user.companyId },
      ),
    );

    const combinedEvents = await runWithoutTenant(() =>
      prisma.auditLog.findMany({
        where: {
          companyId: user.companyId,
          event: DomainEvent.LEGAL_NOTICE_SENT,
          userId: user.id,
        },
      }),
    );
    expect(combinedEvents).toHaveLength(1);
    expect(combinedEvents[0].entityId).toBe(user.id);
    expect((combinedEvents[0].eventData as { payload: LegalNoticeAuditPayload }).payload).toEqual(noticePayload);

    await expect(
      runWithoutTenant(() =>
        runInTransaction(
          async () => {
            await eventService.publish(
              DomainEvent.LEGAL_NOTICE_SENT,
              { entityId: user.id, payload: noticePayload },
              { systemCompanyId: user.companyId, systemUserId: user.id },
            );
            throw new Error("forced notice rollback");
          },
          { companyId: user.companyId },
        ),
      ),
    ).rejects.toThrow("forced notice rollback");
    expect(
      await runWithoutTenant(() =>
        prisma.auditLog.count({
          where: {
            companyId: user.companyId,
            event: DomainEvent.LEGAL_NOTICE_SENT,
            userId: user.id,
          },
        }),
      ),
    ).toBe(1);
  });

  it("persists an invited cloud user's acknowledgement without company-wide acceptance", async () => {
    const suffix = Date.now();
    const repo = new PrismaUserRepo();
    const administrator = await runWithoutTenant(() =>
      repo.createCompanyAndUser({
        email: `invite-admin-${suffix}@example.com`,
        firstName: "Invite",
        lastName: "Admin",
        country: "de",
        agreeToTerms: true,
        avatarUrl: null,
      }),
    );
    companyIds.push(administrator.companyId);

    const authUserId = `auth-invite-${suffix}`;
    const invitedEmail = `invite-member-${suffix}@example.com`;
    await runWithoutTenant(() =>
      prisma.authUser.create({
        data: {
          id: authUserId,
          name: "Invited Member",
          email: invitedEmail,
          companyId: administrator.companyId,
        },
      }),
    );
    authUserIds.push(authUserId);

    const eventService = new EventService(
      [],
      {
        getWebhooksForEvent: vi.fn().mockResolvedValue([]),
        getWebhooksForEventUnscoped: vi.fn().mockResolvedValue([]),
      },
      {
        create: vi.fn().mockResolvedValue([]),
        createUnscoped: vi.fn().mockResolvedValue([]),
      },
      new PrismaAuditLogRepo(),
      { dispatch: vi.fn().mockResolvedValue(undefined) } as never,
    );
    const interactor = new RegisterUserInteractor(
      {
        sendNewUserNotificationEmail: vi.fn().mockResolvedValue(undefined),
      } as never,
      repo,
      eventService,
      unregisteredRouteGuardService(authUserId, invitedEmail) as never,
    );

    const result = await interactor.invoke(
      {
        email: "forged-invited-email@example.com",
        firstName: "Invited",
        lastName: "Member",
        country: "de",
        agreeToTerms: true,
        avatarUrl: null,
      },
      { target: { type: "legacyAuthBinding" } },
    );
    expect(result).toEqual({ ok: true, data: { redirectTo: "/auth/pending" } });

    const invitedUser = await runWithoutTenant(() =>
      prisma.user.findUniqueOrThrow({
        where: { email: invitedEmail },
        select: { agreeToTerms: true, companyId: true, status: true },
      }),
    );
    expect(invitedUser).toEqual({
      agreeToTerms: true,
      companyId: administrator.companyId,
      status: "pendingAuthorization",
    });
    expect(
      await runWithoutTenant(() =>
        prisma.auditLog.count({
          where: {
            companyId: administrator.companyId,
            event: DomainEvent.LEGAL_DOCUMENTS_ACCEPTED,
          },
        }),
      ),
    ).toBe(0);
  });

  it("joins the invited workspace when the identity carries no company of its own", async () => {
    const suffix = `${Date.now()}-cookie`;
    const repo = new PrismaUserRepo();
    const inviter = await runWithoutTenant(() =>
      repo.createCompanyAndUser({
        email: `cookie-admin-${suffix}@example.com`,
        firstName: "Cookie",
        lastName: "Admin",
        country: "de",
        agreeToTerms: true,
        avatarUrl: null,
      }),
    );
    companyIds.push(inviter.companyId);

    const authUserId = `auth-cookie-${suffix}`;
    const invitedEmail = `cookie-member-${suffix}@example.com`;
    await runWithoutTenant(() =>
      prisma.authUser.create({
        data: { id: authUserId, name: "Cookie Member", email: invitedEmail, companyId: null },
      }),
    );
    authUserIds.push(authUserId);

    const interactor = new RegisterUserInteractor(
      { sendNewUserNotificationEmail: vi.fn().mockResolvedValue(undefined) } as never,
      repo,
      newEventService(),
      unregisteredRouteGuardService(authUserId, invitedEmail) as never,
    );

    const result = await interactor.invoke(
      {
        email: invitedEmail,
        firstName: "Cookie",
        lastName: "Member",
        country: "de",
        agreeToTerms: true,
        avatarUrl: null,
      },
      { target: { type: "invitation", companyId: inviter.companyId } },
    );
    expect(result).toEqual({ ok: true, data: { redirectTo: "/auth/pending" } });

    const joined = await runWithoutTenant(() =>
      prisma.user.findUniqueOrThrow({
        where: { email: invitedEmail },
        select: { companyId: true, status: true },
      }),
    );
    expect(joined).toEqual({ companyId: inviter.companyId, status: "pendingAuthorization" });
    expect(
      await runWithoutTenant(() =>
        prisma.authUser.findUniqueOrThrow({ where: { id: authUserId }, select: { companyId: true } }),
      ),
    ).toEqual({ companyId: inviter.companyId });
    expect(
      await runWithoutTenant(() =>
        prisma.company.count({
          where: { id: { not: inviter.companyId }, users: { some: { email: invitedEmail } } },
        }),
      ),
    ).toBe(0);
  });

  it("ignores an identity company that no longer exists and joins the invited workspace instead", async () => {
    const suffix = `${Date.now()}-stale`;
    const repo = new PrismaUserRepo();
    const inviter = await runWithoutTenant(() =>
      repo.createCompanyAndUser({
        email: `stale-admin-${suffix}@example.com`,
        firstName: "Stale",
        lastName: "Admin",
        country: "de",
        agreeToTerms: true,
        avatarUrl: null,
      }),
    );
    companyIds.push(inviter.companyId);

    const deletedCompany = await runWithoutTenant(() => prisma.company.create({ data: {} }));
    const authUserId = `auth-stale-${suffix}`;
    const invitedEmail = `stale-member-${suffix}@example.com`;
    await runWithoutTenant(() =>
      prisma.authUser.create({
        data: { id: authUserId, name: "Stale Member", email: invitedEmail, companyId: deletedCompany.id },
      }),
    );
    authUserIds.push(authUserId);
    await runWithoutTenant(() => prisma.company.delete({ where: { id: deletedCompany.id } }));

    expect(await runWithoutTenant(() => repo.findAuthUserCompanyIdUnscoped(authUserId))).toBeNull();

    const interactor = new RegisterUserInteractor(
      { sendNewUserNotificationEmail: vi.fn().mockResolvedValue(undefined) } as never,
      repo,
      newEventService(),
      unregisteredRouteGuardService(authUserId, invitedEmail) as never,
    );

    const result = await interactor.invoke(
      {
        email: invitedEmail,
        firstName: "Stale",
        lastName: "Member",
        country: "de",
        agreeToTerms: true,
        avatarUrl: null,
      },
      { target: { type: "invitation", companyId: inviter.companyId } },
    );
    expect(result).toEqual({ ok: true, data: { redirectTo: "/auth/pending" } });

    const joined = await runWithoutTenant(() =>
      prisma.user.findUniqueOrThrow({ where: { email: invitedEmail }, select: { companyId: true } }),
    );
    expect(joined.companyId).toBe(inviter.companyId);
    expect(
      await runWithoutTenant(() =>
        prisma.authUser.findUniqueOrThrow({ where: { id: authUserId }, select: { companyId: true } }),
      ),
    ).toEqual({ companyId: inviter.companyId });
  });

  it("fails cleanly when the invited workspace was deleted before registration", async () => {
    const suffix = `${Date.now()}-deleted-invite`;
    const deletedCompany = await runWithoutTenant(() => prisma.company.create({ data: {} }));
    await runWithoutTenant(() => prisma.company.delete({ where: { id: deletedCompany.id } }));

    const authUserId = `auth-${suffix}`;
    const registrationEmail = `deleted-invite-${suffix}@example.com`;
    await runWithoutTenant(() =>
      prisma.authUser.create({
        data: { id: authUserId, name: "Deleted Invite", email: registrationEmail, companyId: null },
      }),
    );
    authUserIds.push(authUserId);
    const interactor = new RegisterUserInteractor(
      { sendNewUserNotificationEmail: vi.fn().mockResolvedValue(undefined) } as never,
      new PrismaUserRepo(),
      newEventService(),
      unregisteredRouteGuardService(authUserId, registrationEmail) as never,
    );

    await expect(
      interactor.invoke(
        {
          email: registrationEmail,
          firstName: "Deleted",
          lastName: "Invite",
          country: "de",
          agreeToTerms: true,
          avatarUrl: null,
        },
        { target: { type: "invitation", companyId: deletedCompany.id } },
      ),
    ).resolves.toEqual({ redirect: "/auth/error?type=invalidInviteLink" });
    expect(await runWithoutTenant(() => prisma.user.findUnique({ where: { email: registrationEmail } }))).toBeNull();
    expect(
      await runWithoutTenant(() =>
        prisma.authUser.findUniqueOrThrow({ where: { id: authUserId }, select: { companyId: true } }),
      ),
    ).toEqual({ companyId: null });
  });

  it("creates nothing without an invitation or explicit create decision", async () => {
    const suffix = `${Date.now()}-no-decision`;
    const authUserId = `auth-${suffix}`;
    const registrationEmail = `no-decision-${suffix}@example.com`;
    await runWithoutTenant(() =>
      prisma.authUser.create({
        data: { id: authUserId, name: "No Decision", email: registrationEmail, companyId: null },
      }),
    );
    authUserIds.push(authUserId);

    const interactor = new RegisterUserInteractor(
      { sendNewUserNotificationEmail: vi.fn().mockResolvedValue(undefined) } as never,
      new PrismaUserRepo(),
      newEventService(),
      unregisteredRouteGuardService(authUserId, registrationEmail) as never,
    );

    const result = await interactor.invoke(
      {
        email: registrationEmail,
        firstName: "No",
        lastName: "Decision",
        country: "de",
        agreeToTerms: true,
        avatarUrl: null,
      },
      { target: { type: "legacyAuthBinding" } },
    );

    expect(result).toEqual({ redirect: "/onboarding" });
    expect(await runWithoutTenant(() => prisma.user.findUnique({ where: { email: registrationEmail } }))).toBeNull();
  });

  it("creates nothing when a cached session references a deleted AuthUser", async () => {
    const suffix = `${Date.now()}-deleted-identity`;
    const repo = new PrismaUserRepo();
    const inviter = await runWithoutTenant(() =>
      repo.createCompanyAndUser({
        email: `deleted-identity-admin-${suffix}@example.com`,
        firstName: "Deleted Identity",
        lastName: "Admin",
        country: "de",
        agreeToTerms: true,
        avatarUrl: null,
      }),
    );
    companyIds.push(inviter.companyId);

    const missingAuthUserId = `auth-${suffix}`;
    const registrationEmail = `deleted-identity-member-${suffix}@example.com`;
    const interactor = new RegisterUserInteractor(
      { sendNewUserNotificationEmail: vi.fn().mockResolvedValue(undefined) } as never,
      repo,
      newEventService(),
      unregisteredRouteGuardService(missingAuthUserId, registrationEmail) as never,
    );

    const result = await interactor.invoke(
      {
        email: registrationEmail,
        firstName: "Deleted",
        lastName: "Identity",
        country: "de",
        agreeToTerms: true,
        avatarUrl: null,
      },
      { target: { type: "invitation", companyId: inviter.companyId } },
    );

    expect(result).toEqual({ redirect: "/auth/signup" });
    expect(await runWithoutTenant(() => prisma.user.findUnique({ where: { email: registrationEmail } }))).toBeNull();
  });

  it("prefers the current invitation over an older live identity binding", async () => {
    const suffix = `${Date.now()}-invite-precedence`;
    const repo = new PrismaUserRepo();
    const olderWorkspaceAdmin = await runWithoutTenant(() =>
      repo.createCompanyAndUser({
        email: `older-admin-${suffix}@example.com`,
        firstName: "Older",
        lastName: "Admin",
        country: "de",
        agreeToTerms: true,
        avatarUrl: null,
      }),
    );
    const currentWorkspaceAdmin = await runWithoutTenant(() =>
      repo.createCompanyAndUser({
        email: `current-admin-${suffix}@example.com`,
        firstName: "Current",
        lastName: "Admin",
        country: "de",
        agreeToTerms: true,
        avatarUrl: null,
      }),
    );
    companyIds.push(olderWorkspaceAdmin.companyId, currentWorkspaceAdmin.companyId);

    const authUserId = `auth-${suffix}`;
    const invitedEmail = `precedence-member-${suffix}@example.com`;
    await runWithoutTenant(() =>
      prisma.authUser.create({
        data: {
          id: authUserId,
          name: "Precedence Member",
          email: invitedEmail,
          companyId: olderWorkspaceAdmin.companyId,
        },
      }),
    );
    authUserIds.push(authUserId);

    const interactor = new RegisterUserInteractor(
      { sendNewUserNotificationEmail: vi.fn().mockResolvedValue(undefined) } as never,
      repo,
      newEventService(),
      unregisteredRouteGuardService(authUserId, invitedEmail) as never,
    );

    const result = await interactor.invoke(
      {
        email: invitedEmail,
        firstName: "Precedence",
        lastName: "Member",
        country: "de",
        agreeToTerms: true,
        avatarUrl: null,
      },
      { target: { type: "invitation", companyId: currentWorkspaceAdmin.companyId } },
    );

    expect(result).toEqual({ ok: true, data: { redirectTo: "/auth/pending" } });
    expect(
      await runWithoutTenant(() =>
        prisma.user.findUniqueOrThrow({ where: { email: invitedEmail }, select: { companyId: true, status: true } }),
      ),
    ).toEqual({ companyId: currentWorkspaceAdmin.companyId, status: "pendingAuthorization" });
    expect(
      await runWithoutTenant(() =>
        prisma.authUser.findUniqueOrThrow({ where: { id: authUserId }, select: { companyId: true } }),
      ),
    ).toEqual({ companyId: currentWorkspaceAdmin.companyId });
  });

  it("makes simultaneous invitation registrations for one identity idempotent", async () => {
    const suffix = randomUUID();
    const setupRepo = new PrismaUserRepo();
    const invitedWorkspaceAdmin = await runWithoutTenant(() =>
      setupRepo.createCompanyAndUser({
        email: `duplicate-target-${suffix}@duplicate-target.invalid`,
        firstName: "Duplicate",
        lastName: "Target",
        country: "de",
        agreeToTerms: true,
        avatarUrl: null,
      }),
    );
    companyIds.push(invitedWorkspaceAdmin.companyId);

    const authUserId = `auth-duplicate-${suffix}`;
    const invitedEmail = `duplicate-member-${suffix}@example.invalid`;
    await runWithoutTenant(() =>
      prisma.authUser.create({
        data: {
          id: authUserId,
          name: "Duplicate Member",
          email: invitedEmail,
          companyId: null,
        },
      }),
    );
    authUserIds.push(authUserId);

    let reportLocked!: (pid: number) => void;
    const authUserLocked = new Promise<number>((resolve) => {
      reportLocked = resolve;
    });
    let releaseFirstRegistration!: () => void;
    const firstRegistrationReleased = new Promise<void>((resolve) => {
      releaseFirstRegistration = resolve;
    });

    class FirstRegistrationPausingUserRepo extends PrismaUserRepo {
      override async lockAuthUserCompanyIdForRegistrationUnscoped(userId: string) {
        const companyId = await super.lockAuthUserCompanyIdForRegistrationUnscoped(userId);
        const [connection] = await this.prisma.$queryRaw<Array<{ pid: number }>>`
          SELECT pg_backend_pid() AS pid
        `;
        if (!connection) throw new Error("Registration transaction has no database connection");
        reportLocked(connection.pid);
        await firstRegistrationReleased;
        return companyId;
      }
    }

    const registrationData = {
      email: invitedEmail,
      firstName: "Duplicate",
      lastName: "Member",
      country: "de" as const,
      agreeToTerms: true,
      avatarUrl: null,
    };
    const registrationTarget = {
      target: { type: "invitation" as const, companyId: invitedWorkspaceAdmin.companyId },
    };
    const authService = { sendNewUserNotificationEmail: vi.fn().mockResolvedValue(undefined) } as never;
    const firstRegistration = new RegisterUserInteractor(
      authService,
      new FirstRegistrationPausingUserRepo(),
      newEventService(),
      unregisteredRouteGuardService(authUserId, invitedEmail) as never,
    ).invoke(registrationData, registrationTarget);

    const blockerPid = await authUserLocked;
    const secondRegistration = new RegisterUserInteractor(
      authService,
      new PrismaUserRepo(),
      newEventService(),
      unregisteredRouteGuardService(authUserId, invitedEmail) as never,
    ).invoke(registrationData, registrationTarget);

    const secondRegistrationBlocked = await waitForBlockedDatabaseSession(blockerPid);
    releaseFirstRegistration();

    const [firstResult, secondResult] = await Promise.all([firstRegistration, secondRegistration]);
    expect(secondRegistrationBlocked).toBe(true);
    expect(firstResult).toEqual({ ok: true, data: { redirectTo: "/auth/pending" } });
    expect(secondResult).toEqual({ redirect: "/auth/pending" });

    await runWithoutTenant(async () => {
      expect(await prisma.user.count({ where: { email: invitedEmail } })).toBe(1);
      expect(
        await prisma.user.count({
          where: { email: invitedEmail, companyId: invitedWorkspaceAdmin.companyId },
        }),
      ).toBe(1);
      expect(
        await prisma.company.count({
          where: { users: { some: { email: invitedEmail } } },
        }),
      ).toBe(1);
      expect(
        await prisma.authUser.findUniqueOrThrow({ where: { id: authUserId }, select: { companyId: true } }),
      ).toEqual({ companyId: invitedWorkspaceAdmin.companyId });
    });
  });

  it("keeps the invited workspace binding when operator deletion races with registration", async () => {
    const suffix = randomUUID();
    const setupRepo = new PrismaUserRepo();
    const deletedWorkspaceAdmin = await runWithoutTenant(() =>
      setupRepo.createCompanyAndUser({
        email: `race-source-${suffix}@race-source.invalid`,
        firstName: "Race",
        lastName: "Source",
        country: "de",
        agreeToTerms: true,
        avatarUrl: null,
      }),
    );
    const invitedWorkspaceAdmin = await runWithoutTenant(() =>
      setupRepo.createCompanyAndUser({
        email: `race-target-${suffix}@race-target.invalid`,
        firstName: "Race",
        lastName: "Target",
        country: "de",
        agreeToTerms: true,
        avatarUrl: null,
      }),
    );
    companyIds.push(deletedWorkspaceAdmin.companyId, invitedWorkspaceAdmin.companyId);

    const authUserId = `auth-race-${suffix}`;
    const invitedEmail = `race-member-${suffix}@example.invalid`;
    await runWithoutTenant(() =>
      prisma.authUser.create({
        data: {
          id: authUserId,
          name: "Race Member",
          email: invitedEmail,
          companyId: deletedWorkspaceAdmin.companyId,
        },
      }),
    );
    authUserIds.push(authUserId);

    let reportLocked!: (pid: number) => void;
    const authUserLocked = new Promise<number>((resolve) => {
      reportLocked = resolve;
    });
    let releaseRegistration!: () => void;
    const registrationReleased = new Promise<void>((resolve) => {
      releaseRegistration = resolve;
    });

    class LockPausingUserRepo extends PrismaUserRepo {
      override async lockAuthUserCompanyIdForRegistrationUnscoped(userId: string) {
        const companyId = await super.lockAuthUserCompanyIdForRegistrationUnscoped(userId);
        const [connection] = await this.prisma.$queryRaw<Array<{ pid: number }>>`
          SELECT pg_backend_pid() AS pid
        `;
        if (!connection) throw new Error("Registration transaction has no database connection");
        reportLocked(connection.pid);
        await registrationReleased;
        return companyId;
      }
    }

    const registration = new RegisterUserInteractor(
      { sendNewUserNotificationEmail: vi.fn().mockResolvedValue(undefined) } as never,
      new LockPausingUserRepo(),
      newEventService(),
      unregisteredRouteGuardService(authUserId, invitedEmail) as never,
    ).invoke(
      {
        email: invitedEmail,
        firstName: "Race",
        lastName: "Member",
        country: "de",
        agreeToTerms: true,
        avatarUrl: null,
      },
      { target: { type: "invitation", companyId: invitedWorkspaceAdmin.companyId } },
    );

    const blockerPid = await authUserLocked;
    const actor = {
      authUserId: `auth-operator-${suffix}`,
      companyId: `operator-company-${suffix}`,
      email: `operator-${suffix}@example.invalid`,
      userId: `operator-${suffix}`,
    };
    operatorActorIds.push(actor.userId);
    const deletion = runWithOperator(actor, () =>
      new PrismaOperatorRepo().deleteWorkspaceUnscoped({
        companyId: deletedWorkspaceAdmin.companyId,
        confirmWorkspaceLabel: "race-source.invalid",
        reason: "Concurrency regression",
      }),
    );

    const operatorDeletionBlocked = await waitForBlockedDatabaseSession(blockerPid);
    releaseRegistration();

    const [registrationResult, deletionResult] = await Promise.all([registration, deletion]);
    expect(operatorDeletionBlocked).toBe(true);
    expect(registrationResult).toEqual({ ok: true, data: { redirectTo: "/auth/pending" } });
    expect(deletionResult).toMatchObject({
      companyId: deletedWorkspaceAdmin.companyId,
      deletedMemberCount: 1,
    });

    await runWithoutTenant(async () => {
      expect(await prisma.company.findUnique({ where: { id: deletedWorkspaceAdmin.companyId } })).toBeNull();
      expect(
        await prisma.authUser.findUniqueOrThrow({ where: { id: authUserId }, select: { companyId: true } }),
      ).toEqual({ companyId: invitedWorkspaceAdmin.companyId });
      expect(
        await prisma.user.findUniqueOrThrow({
          where: { email: invitedEmail },
          select: { companyId: true, status: true },
        }),
      ).toEqual({ companyId: invitedWorkspaceAdmin.companyId, status: "pendingAuthorization" });
    });
  });

  it("enforces and clears one company-wide deadline across an administrator and member", async () => {
    const suffix = Date.now();
    const repo = new PrismaUserRepo();
    const admin = await runWithoutTenant(() =>
      repo.createCompanyAndUser({
        email: `legal-admin-${suffix}@example.com`,
        firstName: "Legal",
        lastName: "Admin",
        country: "de",
        agreeToTerms: true,
        avatarUrl: null,
      }),
    );
    companyIds.push(admin.companyId);
    const member = await runWithoutTenant(() =>
      repo.registerExistingCompany({
        email: `legal-member-${suffix}@example.com`,
        firstName: "Legal",
        lastName: "Member",
        country: "de",
        agreeToTerms: false,
        avatarUrl: null,
        companyId: admin.companyId,
      }),
    );
    const auditRepo = new PrismaAuditLogRepo();
    const eventService = new EventService(
      [],
      {
        getWebhooksForEvent: vi.fn().mockResolvedValue([]),
        getWebhooksForEventUnscoped: vi.fn().mockResolvedValue([]),
      },
      {
        create: vi.fn().mockResolvedValue([]),
        createUnscoped: vi.fn().mockResolvedValue([]),
      },
      auditRepo,
      { dispatch: vi.fn().mockResolvedValue(undefined) } as never,
    );
    const versions = currentLegalDocumentVersions();
    await runWithoutTenant(async () => {
      await eventService.publish(
        DomainEvent.LEGAL_NOTICE_SENT,
        {
          entityId: admin.id,
          payload: {
            versions,
            changedDocuments: ["terms", "dpa", "privacy", "subprocessors"],
            recipientEmail: admin.email,
            effectiveAt: "2026-08-06T00:00:00.000Z",
          },
        },
        { systemCompanyId: admin.companyId, systemUserId: admin.id },
      );
      await eventService.publish(
        DomainEvent.LEGAL_NOTICE_SENT,
        {
          entityId: member.id,
          payload: {
            versions,
            changedDocuments: ["privacy"],
            recipientEmail: member.email,
            effectiveAt: null,
          },
        },
        { systemCompanyId: admin.companyId, systemUserId: member.id },
      );
    });

    await runWithoutTenant(() =>
      prisma.auditLog.create({
        data: {
          companyId: admin.companyId,
          entityId: admin.companyId,
          event: DomainEvent.LEGAL_DOCUMENTS_ACCEPTED,
          eventData: { payload: { versions } },
          userId: admin.id,
        },
      }),
    );

    const statusInteractor = new GetLegalStatusInteractor(auditRepo);
    const afterDeadline = new Date("2026-08-07T00:00:00.000Z");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(afterDeadline);
    try {
      activeTenantUser.value = admin;
      await expect(statusInteractor.invoke()).resolves.toMatchObject({
        contractAccepted: false,
        mustAccept: true,
      });
      activeTenantUser.value = member;
      await expect(statusInteractor.invoke()).resolves.toMatchObject({
        contractAccepted: false,
        mustAccept: true,
      });

      activeTenantUser.value = admin;
      await new AcceptLegalDocumentsInteractor(auditRepo, eventService).invoke({
        agreeToLegalDocuments: true,
      });

      await expect(statusInteractor.invoke()).resolves.toMatchObject({
        contractAccepted: true,
        mustAccept: false,
      });
      activeTenantUser.value = member;
      await expect(statusInteractor.invoke()).resolves.toMatchObject({
        contractAccepted: true,
        mustAccept: false,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("rolls back the company, user, and queued acceptance evidence together", async () => {
    const rollbackEmail = `legal-rollback-${Date.now()}@example.com`;
    const authUserId = `auth-rollback-${Date.now()}`;
    await runWithoutTenant(() =>
      prisma.authUser.create({
        data: { id: authUserId, name: "Rollback Check", email: rollbackEmail, companyId: null },
      }),
    );
    authUserIds.push(authUserId);
    class FailingRegistrationListener extends DomainEventListener {
      readonly handlers = {
        [DomainEvent.USER_REGISTERED]: () => Promise.reject(new Error("forced registration rollback")),
      };
    }
    const eventService = new EventService(
      [new FailingRegistrationListener()],
      {
        getWebhooksForEvent: vi.fn().mockResolvedValue([]),
        getWebhooksForEventUnscoped: vi.fn().mockResolvedValue([]),
      },
      {
        create: vi.fn().mockResolvedValue([]),
        createUnscoped: vi.fn().mockResolvedValue([]),
      },
      new PrismaAuditLogRepo(),
      { dispatch: vi.fn().mockResolvedValue(undefined) } as never,
    );
    const interactor = new RegisterUserInteractor(
      {
        sendNewUserNotificationEmail: vi.fn().mockResolvedValue(undefined),
      } as never,
      new PrismaUserRepo(),
      eventService,
      unregisteredRouteGuardService(authUserId, rollbackEmail) as never,
    );

    await expect(
      interactor.invoke(
        {
          email: rollbackEmail,
          firstName: "Rollback",
          lastName: "Check",
          country: "de",
          agreeToTerms: true,
          avatarUrl: null,
        },
        { target: { type: "createCompany" } },
      ),
    ).rejects.toThrow("forced registration rollback");

    expect(await runWithoutTenant(() => prisma.user.findUnique({ where: { email: rollbackEmail } }))).toBeNull();
    expect(
      await runWithoutTenant(() =>
        prisma.authUser.findUniqueOrThrow({ where: { id: authUserId }, select: { companyId: true } }),
      ),
    ).toEqual({ companyId: null });
    expect(
      await runWithoutTenant(() =>
        prisma.auditLog.count({
          where: {
            event: DomainEvent.LEGAL_DOCUMENTS_ACCEPTED,
            eventData: {
              path: ["payload", "acceptingEmail"],
              equals: rollbackEmail,
            },
          },
        }),
      ),
    ).toBe(0);
  });
});
