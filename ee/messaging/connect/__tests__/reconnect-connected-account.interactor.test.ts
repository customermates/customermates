import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockUser } from "@/tests/helpers/mock-user";
import {
  MOCK_ENV_MODULE,
  createMockDiModule,
  MOCK_ZOD_MODULE,
  MOCK_PRISMA_DB_MODULE,
} from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();
const request = vi.hoisted(() => ({ origin: "https://feat-inbox.customermates.com" }));

vi.mock("@/env", () => ({
  env: {
    ...MOCK_ENV_MODULE.env,
    APP_MODE: "cloud",
    AUTH_ALLOWED_HOSTS: ["customermates-git-feat-inbox-customermates.vercel.app", "*.customermates.com"],
    BASE_URL: "https://customermates-git-feat-inbox-customermates.vercel.app",
  },
}));
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);
vi.mock("next/headers", () => ({
  headers: () => new Headers({ origin: request.origin }),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: () => Promise.resolve((key: string) => key),
  getLocale: () => Promise.resolve("en"),
}));

import { EntitlementService } from "@/ee/subscription/entitlement.service";
import { ReconnectConnectedAccountInteractor } from "../reconnect-connected-account.interactor";

describe("ReconnectConnectedAccountInteractor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    request.origin = "https://feat-inbox.customermates.com";
  });

  it("returns from hosted auth to the validated Preview vanity origin", async () => {
    const repo = {
      findAccountByIdOrThrow: vi.fn().mockResolvedValue({
        id: "10000000-0000-4000-8000-000000000001",
        unipileAccountId: "provider-account-1",
        provider: "google",
        displayName: "Max Bergmann · Google",
        emailAddress: "max.bergmann@customermates.com",
      }),
      getSubscriptionOrThrow: vi.fn().mockResolvedValue({
        status: "active",
        trialEndDate: null,
        plan: "pro",
      }),
    };
    const messagingService = {
      createReconnectAuthLink: vi.fn().mockResolvedValue("https://auth.example.com/reconnect"),
    };
    const eventService = { publish: vi.fn().mockResolvedValue(undefined) };
    const entitlements = new EntitlementService({ getSubscriptionOrThrow: repo.getSubscriptionOrThrow } as never);
    const interactor = new ReconnectConnectedAccountInteractor(
      repo as never,
      messagingService as never,
      eventService as never,
      entitlements,
    );

    await interactor.invoke({ id: "10000000-0000-4000-8000-000000000001" });

    expect(messagingService.createReconnectAuthLink).toHaveBeenCalledWith(
      expect.objectContaining({
        redirectUri: "https://feat-inbox.customermates.com/profile/connected-accounts",
      }),
    );
  });
});
