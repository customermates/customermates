import { describe, expect, it, vi } from "vitest";

import { createMockUser } from "@/tests/helpers/mock-user";
import {
  MOCK_ENV_MODULE,
  createMockDiModule,
  MOCK_ZOD_MODULE,
  MOCK_PRISMA_DB_MODULE,
} from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);
vi.mock("next-intl/server", () => ({
  getTranslations: () => Promise.resolve(Object.assign((key: string) => key, { raw: (key: string) => key })),
  getLocale: () => Promise.resolve("en"),
}));

import { runWithTenant } from "@/core/decorators/tenant-context";
import { SetConnectedAccountVisibilityInteractor } from "../set-connected-account-visibility.interactor";

const ID = "10000000-0000-4000-8000-000000000001";

describe("SetConnectedAccountVisibilityInteractor", () => {
  it("resolves the account before the plan check, so an unknown account is not found on every plan", async () => {
    const missing = Object.assign(new Error("No record was found"), { code: "P2025" });
    const repo = { getAccountByIdOrThrow: vi.fn().mockRejectedValue(missing), setAccountSharedOrThrow: vi.fn() };
    const entitlements = { require: vi.fn() };
    const interactor = new SetConnectedAccountVisibilityInteractor(
      repo as never,
      { publish: vi.fn() } as never,
      entitlements as never,
    );

    await expect(runWithTenant(mockUser, () => interactor.invoke({ id: ID, shared: false }))).rejects.toBe(missing);
    expect(entitlements.require).not.toHaveBeenCalled();
    expect(repo.setAccountSharedOrThrow).not.toHaveBeenCalled();
  });
});
