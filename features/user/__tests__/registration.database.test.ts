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
const { runWithoutTenant } = await import("@/core/decorators/tenant-context");
const { runInTransaction } = await import("@/core/decorators/transaction-runner");

const email = `real-db-check-${Date.now()}@example.com`;
const companyIds: string[] = [];
const authUserIds: string[] = [];

afterAll(async () => {
  for (const authUserId of authUserIds)
    await runWithoutTenant(() => prisma.authUser.delete({ where: { id: authUserId } }));
  for (const companyId of companyIds) await runWithoutTenant(() => prisma.company.delete({ where: { id: companyId } }));
  await prisma.$disconnect();
});

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;

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
      ["deal", "Status"],
      ["task", "Status"],
    ]);

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

  it("atomically creates a new cloud company and its initial legal audit evidence", async () => {
    const registrationEmail = `legal-registration-${Date.now()}@example.com`;
    const authService = {
      resolveSession: vi.fn().mockResolvedValue({
        session: { user: { id: `auth-${Date.now()}` } },
      }),
      sendNewUserNotificationEmail: vi.fn().mockResolvedValue(undefined),
    };
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
      { dispatch: vi.fn().mockResolvedValue(undefined) },
    );
    const interactor = new RegisterUserInteractor(authService as never, new PrismaUserRepo(), eventService);

    const result = await interactor.invoke({
      email: registrationEmail,
      firstName: "Legal",
      lastName: "Evidence",
      country: "de",
      agreeToTerms: true,
      avatarUrl: null,
    });
    expect("ok" in result && result.ok).toBe(true);

    const user = await runWithoutTenant(() => prisma.user.findUniqueOrThrow({ where: { email: registrationEmail } }));
    companyIds.push(user.companyId);
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
      { dispatch: vi.fn().mockResolvedValue(undefined) },
    );
    const interactor = new RegisterUserInteractor(
      {
        resolveSession: vi.fn().mockResolvedValue({ session: { user: { id: authUserId } } }),
        sendNewUserNotificationEmail: vi.fn().mockResolvedValue(undefined),
      } as never,
      repo,
      eventService,
    );

    const result = await interactor.invoke({
      email: invitedEmail,
      firstName: "Invited",
      lastName: "Member",
      country: "de",
      agreeToTerms: true,
      avatarUrl: null,
    });
    expect("ok" in result && result.ok).toBe(true);

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
      { dispatch: vi.fn().mockResolvedValue(undefined) },
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
      { dispatch: vi.fn().mockResolvedValue(undefined) },
    );
    const interactor = new RegisterUserInteractor(
      {
        resolveSession: vi.fn().mockResolvedValue({
          session: { user: { id: `auth-rollback-${Date.now()}` } },
        }),
        sendNewUserNotificationEmail: vi.fn().mockResolvedValue(undefined),
      } as never,
      new PrismaUserRepo(),
      eventService,
    );

    await expect(
      interactor.invoke({
        email: rollbackEmail,
        firstName: "Rollback",
        lastName: "Check",
        country: "de",
        agreeToTerms: true,
        avatarUrl: null,
      }),
    ).rejects.toThrow("forced registration rollback");

    expect(await runWithoutTenant(() => prisma.user.findUnique({ where: { email: rollbackEmail } }))).toBeNull();
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
