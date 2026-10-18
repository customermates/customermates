import { beforeEach, describe, expect, it, vi } from "vitest";

import { MOCK_ENV_MODULE, MOCK_ZOD_MODULE } from "@/tests/helpers/interactor-test-setup";

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("next-intl/server", () => ({
  getTranslations: () => Promise.resolve(Object.assign((key: string) => key, { raw: (key: string) => key })),
}));
vi.mock("@/core/decorators/transaction-runner", () => ({
  runInTransaction: <T>(work: () => Promise<T>) => work(),
}));

import { CustomErrorCode } from "@/core/validation/validation.types";
import { interactorFailureCodes } from "@/core/validation/validation.utils";

import { JoinWorkspaceInteractor } from "../join-workspace.interactor";

const mutableEnv = MOCK_ENV_MODULE.env as unknown as { APP_MODE: "cloud" | "demo" | "self-hosted" };

const member = {
  id: "member-1",
  companyId: "company-invited",
  email: "ben@example.com",
  firstName: "Ben",
  lastName: "Keller",
  country: "de",
  status: "pendingAuthorization",
  avatarUrl: null,
  roleId: null,
};

describe("JoinWorkspaceInteractor", () => {
  let authService: {
    getInteractiveSession: ReturnType<typeof vi.fn>;
    setSessionActiveCompany: ReturnType<typeof vi.fn>;
    revokeMembershipCredentials: ReturnType<typeof vi.fn>;
  };
  let memberships: Record<string, ReturnType<typeof vi.fn>>;
  let repo: { hasLeftMembershipUnscoped: ReturnType<typeof vi.fn>; registerExistingCompany: ReturnType<typeof vi.fn> };
  let eventService: { publish: ReturnType<typeof vi.fn> };

  function interactor() {
    return new JoinWorkspaceInteractor(
      authService as never,
      {
        resolve: vi.fn().mockResolvedValue({ status: "valid", type: "invitation", companyId: "company-invited" }),
      } as never,
      memberships as never,
      repo as never,
      eventService as never,
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mutableEnv.APP_MODE = "cloud";
    authService = {
      getInteractiveSession: vi.fn().mockResolvedValue({
        session: { id: "session-1" },
        user: { id: "login-1", email: "ben@example.com", emailVerified: true, createdAt: new Date() },
      }),
      setSessionActiveCompany: vi.fn().mockResolvedValue(undefined),
      revokeMembershipCredentials: vi.fn().mockResolvedValue(0),
    };
    memberships = {
      findMembershipUnscoped: vi.fn().mockResolvedValue(null),
      findMembershipProfileUnscoped: vi
        .fn()
        .mockResolvedValue({ firstName: "Ben", lastName: "Keller", country: "de", avatarUrl: null }),
      setLastUsedCompanyUnscoped: vi.fn().mockResolvedValue(undefined),
      markMembershipActiveUnscoped: vi.fn().mockResolvedValue(undefined),
    };
    repo = {
      hasLeftMembershipUnscoped: vi.fn().mockResolvedValue(false),
      registerExistingCompany: vi.fn().mockResolvedValue(member),
    };
    eventService = { publish: vi.fn().mockResolvedValue(undefined) };
  });

  it("refuses to ask to join a cloud workspace until the terms are accepted", async () => {
    const result = await interactor().invoke({ intent: "signed-intent", agreeToTerms: false });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(interactorFailureCodes(result.error)).toEqual([CustomErrorCode.termsNotAgreed]);
      expect(result.error.issues[0]?.path).toEqual(["agreeToTerms"]);
    }
    expect(repo.registerExistingCompany).not.toHaveBeenCalled();
    expect(authService.setSessionActiveCompany).not.toHaveBeenCalled();
    expect(eventService.publish).not.toHaveBeenCalled();
  });

  it("records the accepted terms on the new request", async () => {
    const result = await interactor().invoke({ intent: "signed-intent", agreeToTerms: true });

    expect(result).toEqual({
      ok: true,
      data: { companyId: "company-invited", status: "pendingAuthorization", alreadyMember: false },
    });
    expect(repo.registerExistingCompany).toHaveBeenCalledWith(
      expect.objectContaining({ email: "ben@example.com", companyId: "company-invited", agreeToTerms: true }),
    );
    expect(authService.setSessionActiveCompany).toHaveBeenCalledWith("session-1", "company-invited");
  });

  it("opens a workspace the login already belongs to without asking for the terms again", async () => {
    memberships.findMembershipUnscoped.mockResolvedValue({ ...member, status: "active" });

    const result = await interactor().invoke({ intent: "signed-intent", agreeToTerms: false });

    expect(result).toEqual({
      ok: true,
      data: { companyId: "company-invited", status: "active", alreadyMember: true },
    });
    expect(repo.registerExistingCompany).not.toHaveBeenCalled();
  });

  it("joins a self-hosted workspace without the managed-service terms", async () => {
    mutableEnv.APP_MODE = "self-hosted";

    const result = await interactor().invoke({ intent: "signed-intent", agreeToTerms: false });

    expect(result.ok).toBe(true);
    expect(repo.registerExistingCompany).toHaveBeenCalledWith(expect.objectContaining({ agreeToTerms: false }));
  });

  it("answers alreadyMember when a parallel request created the membership while this one waited for the lock", async () => {
    memberships.findMembershipUnscoped
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ...member, status: "pendingAuthorization" });

    const result = await interactor().invoke({ intent: "signed-intent", agreeToTerms: true });

    expect(result).toEqual({
      ok: true,
      data: { companyId: "company-invited", status: "pendingAuthorization", alreadyMember: true },
    });
    expect(repo.registerExistingCompany).not.toHaveBeenCalled();
    expect(eventService.publish).not.toHaveBeenCalled();
    expect(authService.setSessionActiveCompany).toHaveBeenCalledWith("session-1", "company-invited");
  });

  it("revokes credentials bound to the workspace after leaving before it revives the left membership", async () => {
    repo.hasLeftMembershipUnscoped.mockResolvedValue(true);

    const result = await interactor().invoke({ intent: "signed-intent", agreeToTerms: true });

    expect(result.ok).toBe(true);
    expect(authService.revokeMembershipCredentials).toHaveBeenCalledWith("login-1", "company-invited");
    expect(authService.revokeMembershipCredentials).toHaveBeenCalledBefore(repo.registerExistingCompany);
  });

  it("revokes nothing when the login never belonged to the workspace", async () => {
    await interactor().invoke({ intent: "signed-intent", agreeToTerms: true });

    expect(authService.revokeMembershipCredentials).not.toHaveBeenCalled();
  });
});
