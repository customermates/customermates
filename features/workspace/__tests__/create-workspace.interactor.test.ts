import { beforeEach, describe, expect, it, vi } from "vitest";

import { MOCK_ENV_MODULE, MOCK_ZOD_MODULE } from "@/tests/helpers/interactor-test-setup";

const calls = vi.hoisted(() => ({ order: [] as string[], afterResponse: [] as Array<() => Promise<unknown>> }));

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("next-intl/server", () => ({
  getTranslations: () => Promise.resolve(Object.assign((key: string) => key, { raw: (key: string) => key })),
}));
vi.mock("@/core/utils/after-response", () => ({
  runAfterResponse: (task: () => Promise<unknown>) => calls.afterResponse.push(task),
}));
vi.mock("@/core/decorators/transaction-runner", () => ({
  runInTransaction: async <T>(work: () => Promise<T>, options?: { timeout?: number }) => {
    calls.order.push(`timeout:${options?.timeout}`);
    calls.order.push("begin");
    const result = await work();
    calls.order.push("commit");
    return result;
  },
}));

import { CustomErrorCode } from "@/core/validation/validation.types";
import { interactorFailureCodes } from "@/core/validation/validation.utils";
import { currentLegalDocumentVersions } from "@/constants/legal-documents";

import { CreateWorkspaceInteractor } from "../create-workspace.interactor";

const mutableEnv = MOCK_ENV_MODULE.env as unknown as { APP_MODE: "cloud" | "demo" | "self-hosted" };

const owner = {
  id: "owner-1",
  companyId: "company-new",
  company: { slug: "taxes" },
  email: "ben@example.com",
  firstName: "Max",
  lastName: "Bergmann",
  country: "de",
  status: "active",
  avatarUrl: null,
  roleId: "role-1",
};

function track<T>(name: string, value: T) {
  return vi.fn(() => {
    calls.order.push(name);
    return Promise.resolve(value);
  });
}

describe("CreateWorkspaceInteractor", () => {
  let authService: {
    getAccountSession: ReturnType<typeof vi.fn>;
    getMcpCredential: ReturnType<typeof vi.fn>;
    sendNewUserNotificationEmail: ReturnType<typeof vi.fn>;
  };
  let routeGuardService: { resolveAccountState: ReturnType<typeof vi.fn> };
  let repo: Record<string, ReturnType<typeof vi.fn>>;
  let registration: { createCompanyAndUser: ReturnType<typeof vi.fn> };
  let eventService: { publish: ReturnType<typeof vi.fn> };

  function interactor() {
    return new CreateWorkspaceInteractor(
      authService as never,
      routeGuardService as never,
      repo as never,
      registration as never,
      eventService as never,
    );
  }

  beforeEach(() => {
    calls.order = [];
    calls.afterResponse = [];
    mutableEnv.APP_MODE = "cloud";
    authService = {
      getAccountSession: vi.fn().mockResolvedValue({
        session: { id: "session-1" },
        user: { id: "login-1", email: "ben@example.com", name: "Ben Wagner" },
      }),
      getMcpCredential: vi.fn().mockResolvedValue({ credential: "bearer", accountWide: true }),
      sendNewUserNotificationEmail: vi.fn().mockResolvedValue(undefined),
    };
    routeGuardService = { resolveAccountState: vi.fn().mockResolvedValue({ state: "allowed", emailVerified: true }) };
    repo = {
      findMembershipProfileUnscoped: vi.fn().mockResolvedValue({
        firstName: "Max",
        lastName: "Bergmann",
        avatarUrl: null,
        country: "de",
        displayLanguage: "de",
        formattingLocale: "de",
        theme: "system",
      }),
      findAuthUserCompanyIdForUpdateUnscoped: track("lockLogin", "company-old"),
      countCreatedWorkspacesUnscoped: track("countCreated", 1),
      countWorkspacesCreatedSinceUnscoped: track("countCreatedToday", 0),
      hasConsumedTrialUnscoped: track("checkTrialConsumed", false),
      hasCreatedWorkspaceUnscoped: track("evaluateTrial", true),
      setLastUsedCompanyUnscoped: track("rememberLastUsed", undefined),
      findAccountLegalVersionsUnscoped: vi.fn().mockResolvedValue(null),
      listWorkspaceMembershipsUnscoped: vi.fn().mockResolvedValue([{ status: "active" }]),
    };
    registration = { createCompanyAndUser: track("createCompany", owner) };
    eventService = { publish: track("publish", undefined) };
  });

  it("locks the login, checks the limits, decides the trial and creates the workspace in one transaction", async () => {
    const result = await interactor().invoke({ name: "Taxes", agreeToTerms: true });

    expect(result).toEqual({ ok: true, data: { companyId: "company-new", slug: "taxes", trial: false } });
    expect(calls.order).toEqual([
      "timeout:15000",
      "begin",
      "lockLogin",
      "countCreated",
      "countCreatedToday",
      "checkTrialConsumed",
      "evaluateTrial",
      "createCompany",
      "rememberLastUsed",
      "publish",
      "publish",
      "commit",
    ]);
    expect(repo.findAuthUserCompanyIdForUpdateUnscoped).toHaveBeenCalledWith("login-1");
    expect(registration.createCompanyAndUser).toHaveBeenCalledWith(
      expect.objectContaining({ workspace: { name: "Taxes", createdByAuthUserId: "login-1", trial: false } }),
    );
    expect(calls.afterResponse).toHaveLength(0);
  });

  it("refuses a further cloud workspace once the login created the limit", async () => {
    repo.countCreatedWorkspacesUnscoped.mockResolvedValue(20);

    const result = await interactor().invoke({ name: "One too many", agreeToTerms: true });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(interactorFailureCodes(result.error)).toEqual([CustomErrorCode.workspaceLimitReached]);
    expect(registration.createCompanyAndUser).not.toHaveBeenCalled();
    expect(repo.setLastUsedCompanyUnscoped).not.toHaveBeenCalled();
  });

  it("refuses a fourth cloud workspace of the same login within 24 hours", async () => {
    repo.countWorkspacesCreatedSinceUnscoped.mockResolvedValue(3);

    const result = await interactor().invoke({ name: "Fourth today", agreeToTerms: true });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(interactorFailureCodes(result.error)).toEqual([CustomErrorCode.workspaceDailyLimitReached]);
    const since = repo.countWorkspacesCreatedSinceUnscoped.mock.calls[0]?.[1] as Date;
    expect(Date.now() - since.getTime()).toBeGreaterThanOrEqual(24 * 60 * 60 * 1000 - 1000);
    expect(registration.createCompanyAndUser).not.toHaveBeenCalled();
  });

  it("refuses a cloud workspace for a login whose email is not verified", async () => {
    routeGuardService.resolveAccountState.mockResolvedValue({ state: "allowed", emailVerified: false });

    const result = await interactor().invoke({ name: "Unverified", agreeToTerms: true });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(interactorFailureCodes(result.error)).toEqual([CustomErrorCode.emailNotVerified]);
    expect(repo.countCreatedWorkspacesUnscoped).not.toHaveBeenCalled();
    expect(registration.createCompanyAndUser).not.toHaveBeenCalled();
  });

  it("does not limit how many workspaces a self-hosted login creates", async () => {
    mutableEnv.APP_MODE = "self-hosted";
    repo.countCreatedWorkspacesUnscoped.mockResolvedValue(500);
    routeGuardService.resolveAccountState.mockResolvedValue({ state: "allowed", emailVerified: false });

    await expect(interactor().invoke({ name: "Another", agreeToTerms: false })).resolves.toMatchObject({ ok: true });
    expect(repo.countCreatedWorkspacesUnscoped).not.toHaveBeenCalled();
    expect(registration.createCompanyAndUser).toHaveBeenCalledWith(
      expect.objectContaining({ workspace: expect.objectContaining({ trial: true }) }),
    );
  });

  it("refuses when the login no longer exists", async () => {
    repo.findAuthUserCompanyIdForUpdateUnscoped.mockResolvedValue(undefined);

    const result = await interactor().invoke({ name: "Gone", agreeToTerms: true });

    expect(result.ok).toBe(false);
    expect(registration.createCompanyAndUser).not.toHaveBeenCalled();
  });

  it("refuses an API key, which has no account session", async () => {
    authService.getAccountSession.mockResolvedValue(null);

    const result = await interactor().invoke({ name: "Key", agreeToTerms: true });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(interactorFailureCodes(result.error)).toEqual([CustomErrorCode.permissionDenied]);
  });

  describe("for an agent", () => {
    it("creates the first workspace of a login without a profile from its name, team size and language", async () => {
      repo.findMembershipProfileUnscoped.mockResolvedValue(null);
      repo.listWorkspaceMembershipsUnscoped.mockResolvedValue([]);
      repo.findAccountLegalVersionsUnscoped.mockResolvedValue(currentLegalDocumentVersions());

      const result = await interactor().invokeForAgent({ name: "Acme", teamSize: "small", displayLanguage: "en" });

      expect(result).toMatchObject({ ok: true, data: { slug: "taxes" } });
      expect(registration.createCompanyAndUser).toHaveBeenCalledWith(
        expect.objectContaining({
          firstName: "Ben",
          lastName: "Wagner",
          agreeToTerms: true,
          workspace: { name: "Acme", createdByAuthUserId: "login-1", trial: false, teamSize: "small" },
          preferences: expect.objectContaining({ displayLanguage: "en" }),
        }),
      );
      expect(calls.afterResponse).toHaveLength(1);
    });

    it("accepts the terms through an active membership of the login", async () => {
      await expect(interactor().invokeForAgent({ name: "Second", teamSize: "solo" })).resolves.toMatchObject({
        ok: true,
      });
      expect(registration.createCompanyAndUser).toHaveBeenCalledWith(expect.objectContaining({ agreeToTerms: true }));
    });

    it("refuses when the login never accepted the terms", async () => {
      repo.listWorkspaceMembershipsUnscoped.mockResolvedValue([]);

      const result = await interactor().invokeForAgent({ name: "Acme", teamSize: "solo" });

      expect(result.ok).toBe(false);
      if (!result.ok) expect(interactorFailureCodes(result.error)).toEqual([CustomErrorCode.workspaceTermsNotAccepted]);
      expect(registration.createCompanyAndUser).not.toHaveBeenCalled();
    });

    it.each([
      ["a connection approved for one workspace", { credential: "bearer", accountWide: false }],
      ["an API key", { credential: "apiKey", accountWide: false }],
    ])("refuses %s", async (_label, credential) => {
      authService.getMcpCredential.mockResolvedValue(credential);

      const result = await interactor().invokeForAgent({ name: "Acme", teamSize: "solo" });

      expect(result.ok).toBe(false);
      if (!result.ok)
        expect(interactorFailureCodes(result.error)).toEqual([CustomErrorCode.workspaceCreationUnavailable]);
      expect(registration.createCompanyAndUser).not.toHaveBeenCalled();
    });

    it("is not offered outside Cloud", async () => {
      mutableEnv.APP_MODE = "self-hosted";

      const result = await interactor().invokeForAgent({ name: "Acme", teamSize: "solo" });

      expect(result.ok).toBe(false);
      if (!result.ok)
        expect(interactorFailureCodes(result.error)).toEqual([CustomErrorCode.workspaceCreationUnavailable]);
    });

    it("keeps the email verification and the daily limit of the web path", async () => {
      routeGuardService.resolveAccountState.mockResolvedValue({ state: "allowed", emailVerified: false });
      const unverified = await interactor().invokeForAgent({ name: "Acme", teamSize: "solo" });

      routeGuardService.resolveAccountState.mockResolvedValue({ state: "allowed", emailVerified: true });
      repo.countWorkspacesCreatedSinceUnscoped.mockResolvedValue(3);
      const limited = await interactor().invokeForAgent({ name: "Acme", teamSize: "solo" });

      expect(!unverified.ok && interactorFailureCodes(unverified.error)).toEqual([CustomErrorCode.emailNotVerified]);
      expect(!limited.ok && interactorFailureCodes(limited.error)).toEqual([
        CustomErrorCode.workspaceDailyLimitReached,
      ]);
    });
  });
});
