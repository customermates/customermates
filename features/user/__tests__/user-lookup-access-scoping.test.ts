import { describe, it, expect, beforeEach, vi } from "vitest";

import { Action, Resource } from "@/generated/prisma";

import { runWithTenant } from "@/core/decorators/tenant-context";
import { createMockUserWithPermissions } from "@/tests/helpers/mock-user";

const { fake } = vi.hoisted(() => {
  const calls: { op: string; args: any }[] = [];
  const rows: Array<{ id: string; companyId: string }> = [];

  const matches = (row: { id: string; companyId: string }, where: any): boolean => {
    if (!where) return true;
    if (where.companyId !== undefined && row.companyId !== where.companyId) return false;
    if (typeof where.id === "string" && row.id !== where.id) return false;
    if (where.id?.in && !where.id.in.includes(row.id)) return false;
    for (const clause of where.AND ?? []) if (!matches(row, clause)) return false;
    return true;
  };

  return {
    fake: {
      calls,
      rows,
      reset() {
        calls.length = 0;
        rows.length = 0;
      },
      prisma: {
        user: {
          findMany: (args: any) => {
            calls.push({ op: "findMany", args });
            return Promise.resolve(rows.filter((row) => matches(row, args?.where)).map(({ id }) => ({ id })));
          },
          findFirst: (args: any) => {
            calls.push({ op: "findFirst", args });
            return Promise.resolve(rows.find((row) => matches(row, args?.where)) ?? null);
          },
        },
      },
    },
  };
});

vi.mock("@/prisma/db", () => ({ prisma: fake.prisma }));

import { PrismaUserRepo } from "../prisma-user.repository";

const COMPANY = "test-company-id";
const SELF = "test-user-id";
const COLLEAGUE = "22000000-0000-4000-8000-000000000002";

const readOwn = () => createMockUserWithPermissions([{ resource: Resource.users, action: Action.readOwn }]);
const readAll = () => createMockUserWithPermissions([{ resource: Resource.users, action: Action.readAll }]);

beforeEach(() => {
  vi.clearAllMocks();
  fake.reset();
  fake.rows.push({ id: SELF, companyId: COMPANY }, { id: COLLEAGUE, companyId: COMPANY });
});

describe("PrismaUserRepo.getUserById keeps the requested id under readOwn scoping", () => {
  it("returns null for a colleague instead of substituting the caller", async () => {
    const user = await runWithTenant(readOwn(), () => new PrismaUserRepo().getUserById(COLLEAGUE));

    expect(user).toBeNull();
  });

  it("still returns the caller's own record", async () => {
    const user = await runWithTenant(readOwn(), () => new PrismaUserRepo().getUserById(SELF));

    expect(user?.id).toBe(SELF);
  });

  it("returns the requested colleague for a readAll viewer", async () => {
    const user = await runWithTenant(readAll(), () => new PrismaUserRepo().getUserById(COLLEAGUE));

    expect(user?.id).toBe(COLLEAGUE);
  });

  it("keeps companyId at the top level of the where so the tenant guard can read it", async () => {
    await runWithTenant(readOwn(), () => new PrismaUserRepo().getUserById(COLLEAGUE));

    expect(fake.calls.at(-1)?.args.where.companyId).toBe(COMPANY);
  });
});

describe("PrismaUserRepo.findIds keeps the requested id set under readOwn scoping", () => {
  it("does not report an id that was never requested", async () => {
    const found = await runWithTenant(readOwn(), () => new PrismaUserRepo().findIds(new Set([COLLEAGUE])));

    expect(found).toEqual(new Set());
  });

  it("resolves the caller's own id when it is requested", async () => {
    const found = await runWithTenant(readOwn(), () => new PrismaUserRepo().findIds(new Set([SELF, COLLEAGUE])));

    expect(found).toEqual(new Set([SELF]));
  });

  it("keeps companyId at the top level of the where so the tenant guard can read it", async () => {
    await runWithTenant(readOwn(), () => new PrismaUserRepo().findIds(new Set([COLLEAGUE])));

    expect(fake.calls.at(-1)?.args.where.companyId).toBe(COMPANY);
  });
});
