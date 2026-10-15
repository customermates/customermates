import { beforeEach, describe, expect, it, vi } from "vitest";

import { MOCK_ENV_MODULE, MOCK_ZOD_MODULE } from "@/tests/helpers/interactor-test-setup";

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);

import { DecideMcpConsentInteractor } from "../decide-mcp-consent.interactor";
import { ACCOUNT_STATES } from "../account-state";

const admin = { companyId: "company-a", status: "active", role: { isSystemRole: true, permissions: [] } };
const consent = {
  consentCode: "consent-code",
  accept: true,
};

describe("DecideMcpConsentInteractor", () => {
  let authService: { decideMcpConsent: ReturnType<typeof vi.fn> };
  let routeGuardService: {
    resolveAccountState: ReturnType<typeof vi.fn>;
    resolveMcpConsentState: ReturnType<typeof vi.fn>;
    resolveMembershipForConsent: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (MOCK_ENV_MODULE.env as { APP_MODE: "cloud" | "demo" | "self-hosted" }).APP_MODE = "self-hosted";
    authService = {
      decideMcpConsent: vi.fn().mockResolvedValue({
        redirectURI: "https://client.example/callback",
      }),
    };
    routeGuardService = {
      resolveAccountState: vi.fn().mockResolvedValue({ state: "allowed", user: admin }),
      resolveMcpConsentState: vi.fn((resolution: { state: string }) => Promise.resolve(resolution.state)),
      resolveMembershipForConsent: vi.fn().mockResolvedValue(null),
    };
  });

  function createInteractor() {
    return new DecideMcpConsentInteractor(authService as never, routeGuardService as never);
  }

  it.each([
    { state: "allowed", accept: true },
    { state: "allowed", accept: false },
    { state: "onboarding", accept: true },
    { state: "onboarding", accept: false },
  ])("delegates consent for $state with accept=$accept", async ({ state, accept }) => {
    routeGuardService.resolveAccountState.mockResolvedValue({ state, user: admin });
    const decision = { ...consent, accept };

    await expect(createInteractor().invoke(decision)).resolves.toEqual({
      ok: true,
      data: { redirectURI: "https://client.example/callback" },
    });

    expect(routeGuardService.resolveAccountState).toHaveBeenCalledOnce();
    expect(authService.decideMcpConsent).toHaveBeenCalledWith({ ...decision, companyId: "company-a" });
  });

  it.each([
    { isSystemRole: false, permissions: [{ resource: "wiki", action: "readAll" }] },
    { isSystemRole: false, permissions: [{ resource: "api", action: "create" }] },
  ])("turns an approval into a denial when the role lacks Read access All on API & Webhooks", async (role) => {
    routeGuardService.resolveAccountState.mockResolvedValue({ state: "allowed", user: { role } });

    await createInteractor().invoke(consent);

    expect(authService.decideMcpConsent).toHaveBeenCalledWith({ ...consent, accept: false, companyId: null });
  });

  it.each(ACCOUNT_STATES.filter((state) => state !== "allowed" && state !== "onboarding"))(
    "fails closed for the %s state",
    async (state) => {
      routeGuardService.resolveAccountState.mockResolvedValue({ state });

      await expect(createInteractor().invoke(consent)).resolves.toEqual({
        ok: true,
        data: null,
      });
      expect(authService.decideMcpConsent).not.toHaveBeenCalled();
    },
  );

  it.each(["legal", "subscription"])(
    "fails closed for onboarding when the workspace would otherwise be in the %s state",
    async (blocked) => {
      routeGuardService.resolveAccountState.mockResolvedValue({ state: "onboarding" });
      routeGuardService.resolveMcpConsentState.mockResolvedValue(blocked);

      await expect(createInteractor().invoke(consent)).resolves.toEqual({ ok: true, data: null });
      expect(authService.decideMcpConsent).not.toHaveBeenCalled();
    },
  );

  it("binds the connection to another workspace the user chose and may connect", async () => {
    const other = { companyId: "company-b", status: "active", role: { isSystemRole: true, permissions: [] } };
    routeGuardService.resolveMembershipForConsent.mockResolvedValue(other);

    await createInteractor().invoke({ ...consent, companyId: "company-b" });

    expect(routeGuardService.resolveMembershipForConsent).toHaveBeenCalledWith("company-b");
    expect(authService.decideMcpConsent).toHaveBeenCalledWith({ ...consent, companyId: "company-b" });
  });

  it("keeps the current workspace when the user chose it explicitly", async () => {
    await createInteractor().invoke({ ...consent, companyId: "company-a" });

    expect(routeGuardService.resolveMembershipForConsent).not.toHaveBeenCalled();
    expect(authService.decideMcpConsent).toHaveBeenCalledWith({ ...consent, companyId: "company-a" });
  });

  it.each(["inactive", "pending", "legal", "subscription"])(
    "lets a member whose current workspace is %s connect another workspace",
    async (state) => {
      const other = { companyId: "company-b", status: "active", role: { isSystemRole: true, permissions: [] } };
      routeGuardService.resolveAccountState.mockResolvedValue({ state, user: admin });
      routeGuardService.resolveMembershipForConsent.mockResolvedValue(other);

      await createInteractor().invoke({ ...consent, companyId: "company-b" });

      expect(routeGuardService.resolveMembershipForConsent).toHaveBeenCalledWith("company-b");
      expect(authService.decideMcpConsent).toHaveBeenCalledWith({ ...consent, companyId: "company-b" });
    },
  );

  it.each(["legal", "subscription"])(
    "lets onboarding blocked by the %s state connect another workspace",
    async (blocked) => {
      const other = { companyId: "company-b", status: "active", role: { isSystemRole: true, permissions: [] } };
      routeGuardService.resolveAccountState.mockResolvedValue({ state: "onboarding", user: admin });
      routeGuardService.resolveMcpConsentState.mockResolvedValue(blocked);
      routeGuardService.resolveMembershipForConsent.mockResolvedValue(other);

      await createInteractor().invoke({ ...consent, companyId: "company-b" });

      expect(authService.decideMcpConsent).toHaveBeenCalledWith({ ...consent, companyId: "company-b" });
    },
  );

  it.each(["pending", "inactive"])(
    "fails closed when a %s member names its own restricted workspace",
    async (state) => {
      routeGuardService.resolveAccountState.mockResolvedValue({ state, user: admin });

      await expect(createInteractor().invoke({ ...consent, companyId: "company-a" })).resolves.toEqual({
        ok: true,
        data: null,
      });
      expect(authService.decideMcpConsent).not.toHaveBeenCalled();
    },
  );

  it.each(["unauthenticated", "overdueVerification", "unregistered"])(
    "never binds another workspace for the %s state",
    async (state) => {
      routeGuardService.resolveAccountState.mockResolvedValue({
        state,
        user: state === "overdueVerification" ? admin : null,
      });
      routeGuardService.resolveMembershipForConsent.mockResolvedValue({ ...admin, companyId: "company-b" });

      await expect(createInteractor().invoke({ ...consent, companyId: "company-b" })).resolves.toEqual({
        ok: true,
        data: null,
      });
      expect(routeGuardService.resolveMembershipForConsent).not.toHaveBeenCalled();
      expect(authService.decideMcpConsent).not.toHaveBeenCalled();
    },
  );

  it("denies another workspace that a restricted member cannot connect", async () => {
    routeGuardService.resolveAccountState.mockResolvedValue({ state: "pending", user: admin });

    await createInteractor().invoke({ ...consent, companyId: "company-x" });

    expect(authService.decideMcpConsent).toHaveBeenCalledWith({ ...consent, accept: false, companyId: null });
  });

  it("denies a chosen workspace the user cannot connect", async () => {
    await createInteractor().invoke({ ...consent, companyId: "company-x" });

    expect(authService.decideMcpConsent).toHaveBeenCalledWith({ ...consent, accept: false, companyId: null });
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
