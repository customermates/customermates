import { beforeEach, describe, expect, it, vi } from "vitest";

import { MOCK_ENV_MODULE, MOCK_ZOD_MODULE } from "@/tests/helpers/interactor-test-setup";

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("next-intl/server", () => ({
  getTranslations: () => Promise.resolve(Object.assign((key: string) => key, { raw: (key: string) => key })),
}));

import { CustomErrorCode } from "@/core/validation/validation.types";
import { interactorFailureCodes } from "@/core/validation/validation.utils";
import { currentLegalDocumentVersions } from "@/constants/legal-documents";

import { DecideMcpConsentInteractor } from "../decide-mcp-consent.interactor";
import { ACCOUNT_STATES } from "../account-state";

const COMPANY_A = "00000000-0000-4000-8000-00000000000a";
const COMPANY_B = "00000000-0000-4000-8000-00000000000b";
const sessionUser = { id: "login-1", email: "owner@example.com" };
const adminRole = { isSystemRole: true, permissions: [] };
const consent = { consentCode: "consent-code", accept: true };

function workspace(companyId: string, unavailableReason: string | null = null) {
  return { companyId, name: companyId, roleName: "Admin", isCurrent: false, unavailableReason, inactiveReason: null };
}

describe("DecideMcpConsentInteractor", () => {
  let authService: { decideMcpConsent: ReturnType<typeof vi.fn>; getMcpConsentWorkspace: ReturnType<typeof vi.fn> };
  let routeGuardService: {
    resolveAccountState: ReturnType<typeof vi.fn>;
    resolveMembershipForConsent: ReturnType<typeof vi.fn>;
  };
  let consentAccount: { invoke: ReturnType<typeof vi.fn> };
  let legal: { recordAccountLegalVersionsUnscoped: ReturnType<typeof vi.fn> };

  function account(workspaces: ReturnType<typeof workspace>[], termsRequired = false) {
    consentAccount.invoke.mockResolvedValue({ ok: true, data: { workspaces, termsRequired } });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    (MOCK_ENV_MODULE.env as { APP_MODE: "cloud" | "demo" | "self-hosted" }).APP_MODE = "self-hosted";
    authService = {
      decideMcpConsent: vi.fn().mockResolvedValue({ redirectURI: "https://client.example/callback" }),
      getMcpConsentWorkspace: vi.fn().mockResolvedValue(null),
    };
    routeGuardService = {
      resolveAccountState: vi.fn().mockResolvedValue({ state: "allowed", sessionUser }),
      resolveMembershipForConsent: vi.fn().mockResolvedValue(null),
    };
    consentAccount = { invoke: vi.fn() };
    legal = { recordAccountLegalVersionsUnscoped: vi.fn().mockResolvedValue(undefined) };
    account([workspace(COMPANY_A)]);
  });

  function createInteractor() {
    return new DecideMcpConsentInteractor(
      authService as never,
      routeGuardService as never,
      consentAccount as never,
      legal as never,
    );
  }

  it("binds the only usable workspace as the token's default workspace", async () => {
    await expect(createInteractor().invoke(consent)).resolves.toEqual({
      ok: true,
      data: { redirectURI: "https://client.example/callback" },
    });

    expect(authService.decideMcpConsent).toHaveBeenCalledWith({ ...consent, companyId: COMPANY_A });
  });

  it("approves the whole account without a default when several workspaces are usable", async () => {
    account([workspace(COMPANY_A), workspace(COMPANY_B), workspace("waiting", "pending")]);

    await createInteractor().invoke(consent);

    expect(authService.decideMcpConsent).toHaveBeenCalledWith({ ...consent, companyId: null });
  });

  it("lets an account without any workspace authorize once it accepted the terms, and records the acceptance", async () => {
    routeGuardService.resolveAccountState.mockResolvedValue({ state: "unregistered", sessionUser });
    account([], true);

    await createInteractor().invoke({ ...consent, acceptTerms: true });

    expect(legal.recordAccountLegalVersionsUnscoped).toHaveBeenCalledWith("login-1", currentLegalDocumentVersions());
    expect(authService.decideMcpConsent).toHaveBeenCalledWith({ ...consent, companyId: null });
  });

  it("refuses an approval without the required terms and records nothing", async () => {
    routeGuardService.resolveAccountState.mockResolvedValue({ state: "unregistered", sessionUser });
    account([], true);

    const result = await createInteractor().invoke(consent);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(interactorFailureCodes(result.error)).toEqual([CustomErrorCode.termsNotAgreed]);
    expect(legal.recordAccountLegalVersionsUnscoped).not.toHaveBeenCalled();
    expect(authService.decideMcpConsent).not.toHaveBeenCalled();
  });

  it("lets a denial through without the terms", async () => {
    account([], true);

    await createInteractor().invoke({ ...consent, accept: false });

    expect(authService.decideMcpConsent).toHaveBeenCalledWith({ ...consent, accept: false, companyId: null });
    expect(legal.recordAccountLegalVersionsUnscoped).not.toHaveBeenCalled();
  });

  it("turns an approval into a denial when no workspace of the account can be used", async () => {
    account([workspace(COMPANY_A, "permission"), workspace(COMPANY_B, "pending")]);

    await createInteractor().invoke(consent);

    expect(authService.decideMcpConsent).toHaveBeenCalledWith({ ...consent, accept: false, companyId: null });
  });

  it.each(ACCOUNT_STATES.filter((state) => ["unauthenticated", "overdueVerification"].includes(state)))(
    "fails closed for the %s state",
    async (state) => {
      routeGuardService.resolveAccountState.mockResolvedValue({
        state,
        sessionUser: state === "unauthenticated" ? null : sessionUser,
      });

      await expect(createInteractor().invoke(consent)).resolves.toEqual({ ok: true, data: null });
      expect(authService.decideMcpConsent).not.toHaveBeenCalled();
    },
  );

  describe("older per-workspace URL", () => {
    beforeEach(() => {
      authService.getMcpConsentWorkspace.mockResolvedValue(COMPANY_B);
    });

    it("keeps the workspace of the URL as the token's workspace", async () => {
      routeGuardService.resolveMembershipForConsent.mockResolvedValue({ companyId: COMPANY_B, role: adminRole });

      await createInteractor().invoke(consent);

      expect(routeGuardService.resolveMembershipForConsent).toHaveBeenCalledWith(COMPANY_B);
      expect(authService.decideMcpConsent).toHaveBeenCalledWith({ ...consent, companyId: COMPANY_B });
      expect(consentAccount.invoke).not.toHaveBeenCalled();
    });

    it.each([
      ["not a usable member", null],
      ["without API access", { companyId: COMPANY_B, role: { isSystemRole: false, permissions: [] } }],
    ])("denies the workspace of the URL for a login %s", async (_label, membership) => {
      routeGuardService.resolveMembershipForConsent.mockResolvedValue(membership);

      await createInteractor().invoke(consent);

      expect(authService.decideMcpConsent).toHaveBeenCalledWith({ ...consent, accept: false, companyId: null });
    });
  });
});
