import type { PrismaUserRepo } from "../prisma-user.repository";

import { describe, it, expect, expectTypeOf } from "vitest";

import type { RoleDtoSchema } from "@/features/role/role.schema";

import { TenantUserSchema } from "../user.schema";

type TenantUserSelect = PrismaUserRepo["tenantUserSelect"];
type RoleSelect = TenantUserSelect["role"]["select"];
type PermissionSelect = RoleSelect["permissions"]["select"];

const SENSITIVE_USER_FIELDS = [
  "welcomeEmailSentAt",
  "trialExpiredOfferSentAt",
  "trialInactivationReminderSentAt",
  "trialInactivationNoticeSentAt",
] as const;

describe("tenantUserSelect", () => {
  it("selects exactly the fields TenantUserSchema declares", () => {
    expectTypeOf<keyof TenantUserSelect>().toEqualTypeOf<keyof typeof TenantUserSchema.shape>();
  });

  it("selects exactly the role fields RoleDtoSchema declares", () => {
    expectTypeOf<keyof RoleSelect>().toEqualTypeOf<keyof typeof RoleDtoSchema.shape>();
    expectTypeOf<keyof PermissionSelect>().toEqualTypeOf<"id" | "resource" | "action">();
  });

  it("cannot select a lifecycle claim column", () => {
    expectTypeOf<Extract<keyof TenantUserSelect, `${string}SentAt`>>().toEqualTypeOf<never>();
    expectTypeOf<Extract<keyof typeof TenantUserSchema.shape, `${string}SentAt`>>().toEqualTypeOf<never>();
  });

  it("keeps every lifecycle claim column out of the schema at runtime too", () => {
    const keys = Object.keys(TenantUserSchema.shape);

    for (const field of SENSITIVE_USER_FIELDS) expect(keys).not.toContain(field);
    expect(keys.filter((key) => key.endsWith("SentAt"))).toEqual([]);
  });

  it("accepts a user with no role assigned", () => {
    const role = TenantUserSchema.shape.role.safeParse(null);

    expect(role.success).toBe(true);
  });

  it("requires the role permission list when a role is present", () => {
    const result = TenantUserSchema.shape.role.safeParse({
      id: "20000000-0000-4000-8000-000000000001",
      name: "Admin",
      description: null,
      isSystemRole: true,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["permissions"]);
  });
});
