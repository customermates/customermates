import { beforeEach, describe, expect, it, vi } from "vitest";

import { MOCK_ENV_MODULE, MOCK_ZOD_MODULE } from "@/tests/helpers/interactor-test-setup";

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);

import { DecideMcpConsentInteractor } from "../decide-mcp-consent.interactor";
import { ACCOUNT_STATES } from "../account-state";

const consent = {
  consentCode: "consent-code",
  accept: true,
};

describe("DecideMcpConsentInteractor", () => {
  let authService: { decideMcpConsent: ReturnType<typeof vi.fn> };
  let accountStateResolver: { resolveAccountState: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    (MOCK_ENV_MODULE.env as { APP_MODE: "cloud" | "demo" | "self-hosted" }).APP_MODE = "self-hosted";
    authService = {
      decideMcpConsent: vi.fn().mockResolvedValue({
        redirectURI: "https://client.example/callback",
      }),
    };
    accountStateResolver = {
      resolveAccountState: vi.fn().mockResolvedValue({ state: "allowed" }),
    };
  });

  function createInteractor() {
    return new DecideMcpConsentInteractor(authService as never, accountStateResolver as never);
  }

  it("delegates an allowed consent decision to the auth service", async () => {
    await expect(createInteractor().invoke(consent)).resolves.toEqual({
      ok: true,
      data: { redirectURI: "https://client.example/callback" },
    });

    expect(accountStateResolver.resolveAccountState).toHaveBeenCalledOnce();
    expect(authService.decideMcpConsent).toHaveBeenCalledWith(consent);
  });

  it.each(ACCOUNT_STATES.filter((state) => state !== "allowed"))("fails closed for the %s state", async (state) => {
    accountStateResolver.resolveAccountState.mockResolvedValue({ state });

    await expect(createInteractor().invoke(consent)).resolves.toEqual({
      ok: true,
      data: null,
    });
    expect(authService.decideMcpConsent).not.toHaveBeenCalled();
  });

  it("validates the action input before persistence", async () => {
    const result = await createInteractor().invoke({
      consentCode: "",
      accept: true,
    });

    expect(result.ok).toBe(false);
    expect(authService.decideMcpConsent).not.toHaveBeenCalled();
  });

  it("preserves consent in demo mode", async () => {
    (MOCK_ENV_MODULE.env as { APP_MODE: "cloud" | "demo" | "self-hosted" }).APP_MODE = "demo";

    await expect(createInteractor().invoke(consent)).resolves.toMatchObject({
      ok: true,
    });
    expect(authService.decideMcpConsent).toHaveBeenCalledOnce();
  });
});
