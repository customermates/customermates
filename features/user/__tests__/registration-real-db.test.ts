import { describe, it, expect, afterAll, vi } from "vitest";

import { createTranslator } from "next-intl";

import { buildLegalAcceptance, LEGAL_DOCUMENT_VERSIONS } from "@/constants/legal-documents";
import messages from "@/i18n/locales/en.json";

vi.mock("next-intl/server", () => ({
  getTranslations: () => Promise.resolve(createTranslator({ locale: "en", messages })),
}));

const { PrismaUserRepo } = await import("@/features/user/prisma-user.repository");
const { prisma } = await import("@/prisma/db");
const { runWithoutTenant } = await import("@/core/decorators/tenant-context");

const email = `real-db-check-${Date.now()}@example.com`;
let companyId = "";

afterAll(async () => {
  if (companyId) await runWithoutTenant(() => prisma.company.delete({ where: { id: companyId } }));
  await prisma.$disconnect();
});

describe("registration against a real database", () => {
  it("provisions a workspace with default select fields and no demo records", async () => {
    const repo = new PrismaUserRepo();
    const legalAcceptedAt = new Date("2026-08-06T07:30:00.000Z");

    const user = await runWithoutTenant(() =>
      repo.createCompanyAndUser({
        email,
        firstName: "Real",
        lastName: "Check",
        country: "de",
        agreeToTerms: true,
        avatarUrl: null,
        ...buildLegalAcceptance(legalAcceptedAt),
      }),
    );

    companyId = user.companyId;

    const columns = await runWithoutTenant(() =>
      prisma.customColumn.findMany({ where: { companyId }, orderBy: { createdAt: "asc" } }),
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

    const persistedAcceptance = await runWithoutTenant(() =>
      prisma.user.findUniqueOrThrow({
        where: { id: user.id },
        select: {
          legalAcceptedAt: true,
          legalDpaVersion: true,
          legalPrivacyVersion: true,
          legalTermsVersion: true,
        },
      }),
    );

    expect(persistedAcceptance).toEqual({
      legalAcceptedAt,
      legalDpaVersion: LEGAL_DOCUMENT_VERSIONS.dpa,
      legalPrivacyVersion: LEGAL_DOCUMENT_VERSIONS.privacy,
      legalTermsVersion: LEGAL_DOCUMENT_VERSIONS.terms,
    });
  });
});
