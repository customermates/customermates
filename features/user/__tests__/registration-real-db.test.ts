import { describe, it, expect, afterAll, vi } from "vitest";
import type { LegalNoticeAuditPayload } from "@/constants/legal-documents";

import { createTranslator } from "next-intl";

import messages from "@/i18n/locales/en.json";

vi.mock("next-intl/server", () => ({
  getLocale: () => Promise.resolve("en"),
  getTranslations: () => Promise.resolve(createTranslator({ locale: "en", messages })),
}));
vi.mock("@/env", () => ({
  env: {
    APP_MODE: "cloud",
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: "test",
    VERCEL_GIT_COMMIT_SHA: "a".repeat(40),
  },
}));

const { PrismaUserRepo } = await import("@/features/user/prisma-user.repository");
const { RegisterUserInteractor } = await import("@/features/user/register/register-user.interactor");
const { EventService } = await import("@/features/event/event.service");
const { DomainEventListener } = await import("@/features/event/domain-event.listener");
const { DomainEvent } = await import("@/features/event/domain-events");
const { PrismaAuditLogRepo } = await import("@/features/audit-log/prisma-audit-log.repository");
const { LEGAL_CONTRACT_KEY, LEGAL_INFORMATION_KEY, currentLegalDocumentVersions } = await import(
  "@/constants/legal-documents"
);
const { prisma } = await import("@/prisma/db");
const { runWithoutTenant } = await import("@/core/decorators/tenant-context");
const { runInTransaction } = await import("@/core/decorators/transaction-runner");

const email = `real-db-check-${Date.now()}@example.com`;
const companyIds: string[] = [];

afterAll(async () => {
  for (const companyId of companyIds) await runWithoutTenant(() => prisma.company.delete({ where: { id: companyId } }));
  await prisma.$disconnect();
});

describe("registration against a real database", () => {
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
          entityId: LEGAL_CONTRACT_KEY,
          event: DomainEvent.LEGAL_DOCUMENTS_ACCEPTED,
          userId: user.id,
        },
      }),
    );
    const eventData = acceptance.eventData as {
      payload: {
        acceptanceType: string;
        contractKey: string;
        informationKey: string;
        locale: string;
      };
    };

    expect(eventData.payload).toMatchObject({
      acceptanceType: "initial-onboarding",
      contractKey: LEGAL_CONTRACT_KEY,
      informationKey: LEGAL_INFORMATION_KEY,
      locale: "en",
    });

    const noticePayload: LegalNoticeAuditPayload = {
      versions: currentLegalDocumentVersions(),
      contractKey: LEGAL_CONTRACT_KEY,
      informationKey: LEGAL_INFORMATION_KEY,
      changedDocuments: ["terms", "dpa", "privacy", "subprocessors"],
      recipient: { id: user.id, email: user.email },
      locale: "de",
      noticeAt: "2026-08-07T09:00:00.000Z",
      effectiveAt: "2026-08-21T09:00:00.000Z",
      providerMessageId: "combined-message",
      deployedGitCommit: "a".repeat(40),
      acceptanceType: null,
    };
    await runWithoutTenant(() =>
      runInTransaction(
        async () => {
          await eventService.publish(
            DomainEvent.LEGAL_CONTRACT_NOTICE_SENT,
            { entityId: LEGAL_CONTRACT_KEY, payload: noticePayload },
            { systemCompanyId: user.companyId, systemUserId: user.id },
          );
          await eventService.publish(
            DomainEvent.LEGAL_INFORMATION_NOTICE_SENT,
            { entityId: LEGAL_INFORMATION_KEY, payload: noticePayload },
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
          event: {
            in: [DomainEvent.LEGAL_CONTRACT_NOTICE_SENT, DomainEvent.LEGAL_INFORMATION_NOTICE_SENT],
          },
          userId: user.id,
        },
      }),
    );
    expect(combinedEvents).toHaveLength(2);
    expect(
      combinedEvents.map(
        (entry) => (entry.eventData as { payload: { providerMessageId: string } }).payload.providerMessageId,
      ),
    ).toEqual(["combined-message", "combined-message"]);

    await expect(
      runWithoutTenant(() =>
        runInTransaction(
          async () => {
            await eventService.publish(
              DomainEvent.LEGAL_CONTRACT_NOTICE_SENT,
              { entityId: LEGAL_CONTRACT_KEY, payload: noticePayload },
              { systemCompanyId: user.companyId, systemUserId: user.id },
            );
            await eventService.publish(
              DomainEvent.LEGAL_INFORMATION_NOTICE_SENT,
              { entityId: LEGAL_INFORMATION_KEY, payload: noticePayload },
              { systemCompanyId: user.companyId, systemUserId: user.id },
            );
            throw new Error("forced combined-event rollback");
          },
          { companyId: user.companyId },
        ),
      ),
    ).rejects.toThrow("forced combined-event rollback");
    expect(
      await runWithoutTenant(() =>
        prisma.auditLog.count({
          where: {
            companyId: user.companyId,
            event: {
              in: [DomainEvent.LEGAL_CONTRACT_NOTICE_SENT, DomainEvent.LEGAL_INFORMATION_NOTICE_SENT],
            },
            userId: user.id,
          },
        }),
      ),
    ).toBe(2);
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
              path: ["payload", "acceptingUser", "email"],
              equals: rollbackEmail,
            },
          },
        }),
      ),
    ).toBe(0);
  });
});
