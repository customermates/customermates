import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTranslator } from "next-intl";
import { Action, Resource } from "@/generated/prisma";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createMockUser, createMockUserWithPermissions } from "@/tests/helpers/mock-user";
import messages from "@/i18n/locales/en.json";

vi.mock("next-intl/server", () => ({
  getLocale: () => Promise.resolve("en"),
  getTranslations: (namespace?: "Common.errors") =>
    Promise.resolve(createTranslator({ locale: "en", messages, namespace })),
}));
vi.mock("@/env", () => ({
  env: {
    APP_MODE: "cloud",
    DATABASE_URL: process.env.DATABASE_URL,
    BASE_URL: "http://localhost:4000",
    NODE_ENV: "test",
  },
}));

const { getLinkContactIdentifierInteractor, getUnlinkContactIdentifierInteractor } = await import("@/core/di");
const { prisma } = await import("@/prisma/db");
const { runWithTenant, runWithoutTenant } = await import("@/core/decorators/tenant-context");
const { ForbiddenError } = await import("@/core/errors/app-errors");
const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const companyId = randomUUID();
const otherCompanyId = randomUUID();
const userId = randomUUID();
const user = createMockUser({ id: userId, companyId });

async function makeContact(tenant = companyId) {
  return runWithoutTenant(() =>
    prisma.contact.create({
      data: { companyId: tenant, firstName: "Link", lastName: "Fixture" },
    }),
  );
}
async function identifiers(contactId: string) {
  return runWithoutTenant(() =>
    prisma.contactIdentifier.findMany({
      where: { contactId },
      select: { provider: true, value: true },
      orderBy: { value: "asc" },
    }),
  );
}

describeDatabase("contact identifier linking with real tenant transactions", { timeout: 60000 }, () => {
  beforeAll(async () => {
    await runWithoutTenant(async () => {
      await prisma.company.createMany({ data: [{ id: companyId }, { id: otherCompanyId }] });
      await prisma.user.create({
        data: {
          id: userId,
          companyId,
          email: `link-${userId}@example.com`,
          firstName: "Link",
          lastName: "Tester",
          status: "active",
        },
      });
    });
  });
  afterAll(async () => {
    await runWithoutTenant(() => prisma.company.deleteMany({ where: { id: { in: [companyId, otherCompanyId] } } }));
  });

  it("retains both identifiers when concurrent links target the same contact", async () => {
    const contact = await makeContact();
    const link = getLinkContactIdentifierInteractor();
    const results = await Promise.all([
      runWithTenant(user, () =>
        link.invoke({ contactId: contact.id, provider: "mail", identifier: "first@example.com" }),
      ),
      runWithTenant(user, () =>
        link.invoke({ contactId: contact.id, provider: "mail", identifier: "second@example.com" }),
      ),
    ]);
    expect(results.map((result) => result.ok)).toEqual([true, true]);
    expect(await identifiers(contact.id)).toEqual([
      { provider: "mail", value: "first@example.com" },
      { provider: "mail", value: "second@example.com" },
    ]);
    const auditCount = await runWithoutTenant(() =>
      prisma.auditLog.count({ where: { companyId, entityId: contact.id } }),
    );
    expect(auditCount).toBe(2);
  });

  it("unlinks across equivalent email providers while preserving other identifiers", async () => {
    const contact = await makeContact();
    await runWithTenant(user, async () => {
      const link = getLinkContactIdentifierInteractor();
      expect(
        (await link.invoke({ contactId: contact.id, provider: "google", identifier: "unlink@example.com" })).ok,
      ).toBe(true);
      expect(
        (await link.invoke({ contactId: contact.id, provider: "whatsapp", identifier: "+4915112345678" })).ok,
      ).toBe(true);
      expect(
        (
          await getUnlinkContactIdentifierInteractor().invoke({
            contactId: contact.id,
            provider: "outlook",
            identifier: "unlink@example.com",
          })
        ).ok,
      ).toBe(true);
    });
    expect(await identifiers(contact.id)).toEqual([{ provider: "whatsapp", value: "+4915112345678" }]);
  });

  it("rejects another tenant's contact without changing it", async () => {
    const contact = await makeContact(otherCompanyId);
    const result = await runWithTenant(user, () =>
      getLinkContactIdentifierInteractor().invoke({
        contactId: contact.id,
        provider: "mail",
        identifier: "cross-tenant@example.com",
      }),
    );
    expect(result).toMatchObject({ ok: false, error: { issues: [{ params: { error: "contactNotFound" } }] } });
    expect(await identifiers(contact.id)).toEqual([]);
  });

  it("preserves read-own visibility when update permission is present", async () => {
    const contact = await makeContact();
    const reader = {
      ...createMockUserWithPermissions([
        { resource: Resource.contacts, action: Action.readOwn },
        { resource: Resource.contacts, action: Action.update },
      ]),
      id: userId,
      companyId,
    };
    const result = await runWithTenant(reader, () =>
      getLinkContactIdentifierInteractor().invoke({
        contactId: contact.id,
        provider: "mail",
        identifier: "hidden@example.com",
      }),
    );
    expect(result).toMatchObject({ ok: false, error: { issues: [{ params: { error: "contactNotFound" } }] } });
    expect(await identifiers(contact.id)).toEqual([]);
  });

  it("rejects a read-only user's unlink without deleting the identifier", async () => {
    const contact = await makeContact();
    await runWithTenant(user, () =>
      getLinkContactIdentifierInteractor().invoke({
        contactId: contact.id,
        provider: "mail",
        identifier: "protected@example.com",
      }),
    );
    const reader = {
      ...createMockUserWithPermissions([{ resource: Resource.contacts, action: Action.readAll }]),
      id: userId,
      companyId,
    };
    await expect(
      runWithTenant(reader, () =>
        getUnlinkContactIdentifierInteractor().invoke({
          contactId: contact.id,
          provider: "mail",
          identifier: "protected@example.com",
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(await identifiers(contact.id)).toEqual([{ provider: "mail", value: "protected@example.com" }]);
  });
});
