import type { TenantUser } from "@/features/user/user.schema";

import { Status, CountryCode, Locale, Theme, type Resource, type Action } from "@/generated/prisma";

const MOCK_ROLE = {
  id: "test-role-id",
  name: "Admin",
  description: null,
  isSystemRole: true,
  createdAt: new Date(0),
  updatedAt: new Date(0),
  permissions: [],
} satisfies NonNullable<TenantUser["role"]>;

const BASE_MOCK_USER = {
  id: "test-user-id",
  email: "test@example.com",
  firstName: "Test",
  lastName: "User",
  companyId: "test-company-id",
  roleId: MOCK_ROLE.id,
  status: Status.active,
  displayLanguage: Locale.en,
  formattingLocale: Locale.en,
  theme: Theme.system,
  country: CountryCode.de,
  avatarUrl: null,
  agreeToTerms: true,
  lastActiveAt: new Date(0),
  onboardingWizardCompletedAt: new Date(0),
  createdAt: new Date(0),
  updatedAt: new Date(0),
  role: MOCK_ROLE,
} satisfies TenantUser;

export function createMockUser(overrides: Partial<TenantUser> = {}): TenantUser {
  return { ...BASE_MOCK_USER, ...overrides };
}

export function createMockUserWithPermissions(permissions: Array<{ resource: Resource; action: Action }>): TenantUser {
  return createMockUser({
    role: {
      ...MOCK_ROLE,
      name: "Custom",
      isSystemRole: false,
      permissions: permissions.map((permission, index) => ({ id: `perm-${index}`, ...permission })),
    },
  });
}
