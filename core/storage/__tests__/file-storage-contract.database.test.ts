import type { TenantUser } from "@/features/user/user.schema";

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, vi } from "vitest";

import { defineFileStorageContract } from "./file-storage-contract";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createMockUser } from "@/tests/helpers/mock-user";

vi.mock("@/env", () => ({
  env: {
    APP_MODE: "cloud",
    BASE_URL: "http://127.0.0.1:4000",
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: "test",
  },
}));

const { prisma } = await import("@/prisma/db");
const { runWithTenant, runWithoutTenant } = await import("@/core/decorators/tenant-context");
const { PrismaFileContentRepo } = await import("../prisma-file-content.repository");
const { DatabaseFileStorageDriver } = await import("../database-file-storage.driver");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;

describeDatabase("database file storage driver contract", () => {
  let user: TenantUser | undefined;

  beforeAll(async () => {
    user = await runWithoutTenant(async () => {
      const company = await prisma.company.create({ data: {} });
      const role = await prisma.userRole.create({
        data: {
          companyId: company.id,
          name: "Administrator",
          isSystemRole: true,
        },
      });
      const created = await prisma.user.create({
        data: {
          companyId: company.id,
          roleId: role.id,
          firstName: "Admin",
          lastName: "Test",
          email: `${randomUUID()}@example.test`,
          status: "active",
        },
      });
      return createMockUser({ ...created, role: { ...role, permissions: [] } });
    });
  });

  afterAll(async () => {
    const companyId = user?.companyId;
    if (companyId) await runWithoutTenant(() => prisma.company.delete({ where: { id: companyId } }));
  });

  const tenant = () => {
    if (!user) throw new Error("The contract tenant is missing");
    return user;
  };

  defineFileStorageContract({
    driver: () => new DatabaseFileStorageDriver(new PrismaFileContentRepo(), "http://127.0.0.1:4000", 1024),
    run: (fn) => runWithTenant(tenant(), fn),
    keyPrefix: () => Promise.resolve(tenant().companyId),
  });
});
