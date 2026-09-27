import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  apiKey: vi.fn((options: unknown) => ({ id: "api-key", options })),
  betterAuth: vi.fn((options: unknown) => ({ options })),
}));

vi.mock("@better-auth/api-key", () => ({ apiKey: mocks.apiKey }));
vi.mock("better-auth/minimal", () => ({ betterAuth: mocks.betterAuth }));
vi.mock("better-auth/adapters/prisma", () => ({ prismaAdapter: vi.fn() }));
vi.mock("@/prisma/db", () => ({ prisma: {} }));
vi.mock("@/core/decorators/tenant-context", () => ({ runWithoutTenant: vi.fn() }));
vi.mock("@/env", () => ({
  env: {
    AUTH_ALLOWED_HOSTS: ["localhost:4000"],
    BASE_URL: "http://localhost:4000",
    APP_MODE: "self-hosted",
  },
}));

import "../better-auth";
import { API_KEY_NAME_MAX_LENGTH, API_KEY_NAME_MIN_LENGTH } from "@/features/api-key/api-key-name";
import { CreateApiKeySchema } from "@/features/api-key/create-api-key.interactor";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, zx } from "@/core/validation/validation.utils";

describe("Better Auth limits", () => {
  it("gives the API key plugin the same name length bounds as the create schema", () => {
    expect(mocks.apiKey).toHaveBeenCalledWith(
      expect.objectContaining({
        minimumNameLength: API_KEY_NAME_MIN_LENGTH,
        maximumNameLength: API_KEY_NAME_MAX_LENGTH,
      }),
    );
    expect(CreateApiKeySchema.safeParse({ name: "n".repeat(API_KEY_NAME_MAX_LENGTH) }).success).toBe(true);
    expect(CreateApiKeySchema.safeParse({ name: "n".repeat(API_KEY_NAME_MAX_LENGTH + 1) }).success).toBe(false);
  });

  it("gives email and password sign-up the same password length bounds as the password rule", () => {
    expect(mocks.betterAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        emailAndPassword: expect.objectContaining({
          minPasswordLength: PASSWORD_MIN_LENGTH,
          maxPasswordLength: PASSWORD_MAX_LENGTH,
        }),
      }),
    );

    const password = (length: number) => `Aa1!${"a".repeat(length - 4)}`;
    expect(zx.password().safeParse(password(PASSWORD_MIN_LENGTH)).success).toBe(true);
    expect(zx.password().safeParse(password(PASSWORD_MAX_LENGTH)).success).toBe(true);
    expect(zx.password().safeParse(password(PASSWORD_MIN_LENGTH - 1)).success).toBe(false);
    expect(zx.password().safeParse(password(PASSWORD_MAX_LENGTH + 1)).success).toBe(false);
  });
});
