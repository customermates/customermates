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
    expect(Object.keys(TenantUserSchema.shape).sort()).toEqual(
      [
        "agreeToTerms",
        "avatarUrl",
        "companyId",
        "country",
        "createdAt",
        "displayLanguage",
        "email",
        "firstName",
        "formattingLocale",
        "id",
        "lastActiveAt",
        "lastName",
        "onboardingWizardCompletedAt",
        "role",
        "roleId",
        "status",
        "theme",
        "updatedAt",
      ].sort(),
    );
  });

  it("selects exactly the role fields RoleDtoSchema declares", () => {
    expectTypeOf<keyof RoleSelect>().toEqualTypeOf<keyof typeof RoleDtoSchema.shape>();
    expectTypeOf<keyof PermissionSelect>().toEqualTypeOf<"id" | "resource" | "action">();
  });

  it("cannot select a lifecycle claim column", () => {
    expectTypeOf<Extract<keyof TenantUserSelect, `${string}SentAt`>>().toEqualTypeOf<never>();
    expectTypeOf<Extract<keyof typeof TenantUserSchema.shape, `${string}SentAt`>>().toEqualTypeOf<never>();
  });

  it("strips a lifecycle claim column that reaches the parser", () => {
    const parsed = TenantUserSchema.parse({
      id: "10000000-0000-4000-8000-000000000001",
      email: "test@example.com",
      firstName: "Test",
      lastName: "User",
      companyId: "test-company-id",
      roleId: null,
      status: "active",
      displayLanguage: "en",
      formattingLocale: "en",
      theme: "system",
      country: "de",
      avatarUrl: null,
      agreeToTerms: true,
      lastActiveAt: null,
      onboardingWizardCompletedAt: null,
      createdAt: new Date(0),
      updatedAt: new Date(0),
      role: null,
      welcomeEmailSentAt: new Date(0),
      trialExpiredOfferSentAt: new Date(0),
      trialInactivationReminderSentAt: new Date(0),
      trialInactivationNoticeSentAt: new Date(0),
    });

    for (const field of SENSITIVE_USER_FIELDS) expect(parsed).not.toHaveProperty(field);
    expect(Object.keys(parsed).sort()).toEqual(Object.keys(TenantUserSchema.shape).sort());
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
