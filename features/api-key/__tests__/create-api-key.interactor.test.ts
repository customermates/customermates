import type { AuthService } from "@/features/auth/auth.service";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockUser } from "@/tests/helpers/mock-user";
import {
  createMockDiModule,
  MOCK_ENV_MODULE,
  MOCK_PRISMA_DB_MODULE,
  MOCK_ZOD_MODULE,
} from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);
vi.mock("next-intl/server", () => ({
  getTranslations: () => Promise.resolve((key: string) => key),
}));

import { CreateApiKeyInteractor } from "../create-api-key.interactor";
import { API_KEY_MIN_EXPIRATION_SECONDS, API_KEY_TECHNICAL_MAX_EXPIRATION_SECONDS } from "../api-key-expiration";
import { CustomErrorCode } from "@/core/validation/validation.types";

const createdApiKey = {
  id: "key-id",
  key: "one-time-secret",
  name: "Synthetic integration",
  createdAt: new Date("2026-08-25T10:00:00.000Z"),
  expiresAt: null,
  lastRequest: null,
};

function makeInteractor() {
  const createApiKey = vi.fn().mockResolvedValue({ ok: true, data: createdApiKey });
  const interactor = new CreateApiKeyInteractor({ createApiKey } as unknown as AuthService);

  return { createApiKey, interactor };
}

beforeEach(() => vi.clearAllMocks());

describe("CreateApiKeyInteractor expiration contract", () => {
  it.each([
    undefined,
    API_KEY_MIN_EXPIRATION_SECONDS,
    2 * 365 * 24 * 60 * 60,
    API_KEY_TECHNICAL_MAX_EXPIRATION_SECONDS,
  ])("accepts an exact supported expiration of %s", async (expiresIn) => {
    const { createApiKey, interactor } = makeInteractor();

    const result = await interactor.invoke({ name: "Synthetic integration", expiresIn });

    expect(result).toMatchObject({ ok: true });
    expect(createApiKey).toHaveBeenCalledExactlyOnceWith({ name: "Synthetic integration", expiresIn });
  });

  it.each([
    [API_KEY_MIN_EXPIRATION_SECONDS - 1, CustomErrorCode.apiKeyMinExpiration],
    [API_KEY_TECHNICAL_MAX_EXPIRATION_SECONDS + 1, CustomErrorCode.apiKeyMaxExpiration],
  ])("rejects an out-of-range expiration of %s", async (expiresIn, error) => {
    const { createApiKey, interactor } = makeInteractor();

    const result = await interactor.invoke({ name: "Synthetic integration", expiresIn });

    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.error.issues[0]).toMatchObject({ path: ["expiresIn"], params: { error } });
    expect(createApiKey).not.toHaveBeenCalled();
  });

  it("rejects fractional seconds before calling Better Auth", async () => {
    const { createApiKey, interactor } = makeInteractor();

    const result = await interactor.invoke({
      name: "Synthetic integration",
      expiresIn: API_KEY_MIN_EXPIRATION_SECONDS + 0.5,
    });

    expect(result).toMatchObject({ ok: false });
    expect(createApiKey).not.toHaveBeenCalled();
  });

  it.each([CustomErrorCode.apiKeyMinExpiration, CustomErrorCode.apiKeyMaxExpiration])(
    "returns the Better Auth fallback %s as field validation",
    async (error) => {
      const { createApiKey, interactor } = makeInteractor();
      createApiKey.mockResolvedValueOnce({ ok: false, error });

      const result = await interactor.invoke({
        name: "Synthetic integration",
        expiresIn: API_KEY_MIN_EXPIRATION_SECONDS,
      });

      expect(result).toMatchObject({ ok: false });
      if (!result.ok) {
        expect(result.error.issues[0]).toMatchObject({
          message: `Common.errors.${error}`,
          path: ["expiresIn"],
          params: { error },
        });
      }
    },
  );
});
