/**
 * Shared mock module factories for interactor tests.
 *
 * vi.mock() calls must stay at the top level of each test file (Vitest hoists them),
 * but the RETURN VALUES can come from a shared helper.
 *
 * The DI mock needs a reference to the mock user. Because vi.mock factories are
 * hoisted above variable declarations, DI getter functions capture `mockUser` lazily
 * (they only read it when called, not when the factory object is constructed).
 * Each test file must therefore declare mockUser before the vi.mock call:
 *
 *   import { createMockUser } from "@/tests/helpers/mock-user";
 *   import {
 *     MOCK_ENV_MODULE, createMockDiModule, MOCK_ZOD_MODULE, MOCK_PRISMA_DB_MODULE,
 *   } from "@/tests/helpers/interactor-test-setup";
 *
 *   const mockUser = createMockUser();
 *
 *   vi.mock("@/constants/env", () => MOCK_ENV_MODULE);
 *   vi.mock("@/core/di", () => createMockDiModule(mockUser));
 *   vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
 *   vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);
 */
import { vi } from "vitest";

import type { ExtendedUser } from "@/features/user/user.types";

// ---------------------------------------------------------------------------
// @/constants/env
// ---------------------------------------------------------------------------
export const MOCK_ENV_MODULE = {
  IS_PRODUCTION: false,
  IS_DEVELOPMENT: true,
  IS_DEMO_MODE: false,
  IS_CLOUD_HOSTED: false,
  IS_CLOUD_BUILD: false,
  BASE_URL: "http://localhost:4000",
  RESEND_FROM_EMAIL: "test@test.com",
  AGENT_BASE_URL: "http://localhost:4000",
};

// ---------------------------------------------------------------------------
// @/core/di -- accepts a mock user reference, read lazily inside getters
// ---------------------------------------------------------------------------
const makeFindIds = () => vi.fn().mockImplementation((ids: Set<string>) => Promise.resolve(new Set(ids)));

/**
 * Returns the mock DI module. Accepts a getter function `() => mockUser`
 * instead of the user directly, because vi.mock factories are hoisted above
 * variable declarations -- the user won't be initialized when the factory runs.
 * The getter is only called inside lazy repo/service functions at test runtime.
 */
export function createMockDiModule(getMockUser: () => ExtendedUser) {
  return {
    getUserService: () => ({
      getActiveUserOrThrow: vi.fn().mockResolvedValue(getMockUser()),
      getUser: vi.fn().mockResolvedValue(getMockUser()),
    }),
    getContactRepo: () => ({ findIds: makeFindIds() }),
    getOrganizationRepo: () => ({ findIds: makeFindIds() }),
    getDealRepo: () => ({ findIds: makeFindIds() }),
    getCompanyRepo: () => ({ findIds: makeFindIds() }),
    getCustomColumnRepo: () => ({ findByEntityType: vi.fn().mockResolvedValue([]) }),
    getServiceRepo: () => ({ findIds: makeFindIds() }),
    getTaskRepo: () => ({
      findIds: makeFindIds(),
      findSystemTaskIds: vi.fn().mockResolvedValue(new Set()),
    }),
  };
}

// ---------------------------------------------------------------------------
// @/core/validation/zod-error-map-server
// ---------------------------------------------------------------------------
export const MOCK_ZOD_MODULE = {
  configureZodLocale: vi.fn().mockResolvedValue(undefined),
};

// ---------------------------------------------------------------------------
// @/prisma/db
// ---------------------------------------------------------------------------
export const MOCK_PRISMA_DB_MODULE = {
  prisma: {
    $transaction: vi.fn().mockImplementation((fn: any) =>
      fn({
        $executeRaw: vi.fn().mockResolvedValue(undefined),
        auditLog: { createMany: vi.fn() },
        webhookDelivery: { createMany: vi.fn() },
      }),
    ),
    $extends: vi.fn().mockReturnThis(),
  },
};

// ---------------------------------------------------------------------------
// Common mock service/repo factories used in beforeEach blocks
// ---------------------------------------------------------------------------
export function createMockEventService() {
  return { publish: vi.fn().mockResolvedValue(undefined) };
}

export function createMockWidgetService() {
  return { recalculateUserWidgets: vi.fn().mockResolvedValue(undefined) };
}

export function createMockRelatedRepos() {
  return {
    orgRepo: { getManyOrThrowUnscoped: vi.fn().mockResolvedValue([]) },
    dealRepo: { getManyOrThrowUnscoped: vi.fn().mockResolvedValue([]) },
    contactRepo: { getManyOrThrowUnscoped: vi.fn().mockResolvedValue([]) },
    serviceRepo: { getManyOrThrowUnscoped: vi.fn().mockResolvedValue([]) },
  };
}
