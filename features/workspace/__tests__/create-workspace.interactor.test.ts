import { beforeEach, describe, expect, it, vi } from "vitest";

import { MOCK_ENV_MODULE, MOCK_ZOD_MODULE } from "@/tests/helpers/interactor-test-setup";

const calls = vi.hoisted(() => ({ order: [] as string[] }));

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("next-intl/server", () => ({
  getTranslations: () => Promise.resolve(Object.assign((key: string) => key, { raw: (key: string) => key })),
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
  let authService: { getInteractiveSession: ReturnType<typeof vi.fn> };
  let repo: Record<string, ReturnType<typeof vi.fn>>;
  let registration: { createCompanyAndUser: ReturnType<typeof vi.fn> };
  let eventService: { publish: ReturnType<typeof vi.fn> };

  function interactor() {
    return new CreateWorkspaceInteractor(
      authService as never,
      { resolveAccountState: vi.fn().mockResolvedValue({ state: "allowed" }) } as never,
      repo as never,
      registration as never,
      eventService as never,
    );
  }

  beforeEach(() => {
    calls.order = [];
    mutableEnv.APP_MODE = "cloud";
    authService = {
      getInteractiveSession: vi
        .fn()
        .mockResolvedValue({ session: { id: "session-1" }, user: { id: "login-1", email: "ben@example.com" } }),
    };
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
      hasConsumedTrialUnscoped: track("checkTrialConsumed", false),
      hasCreatedWorkspaceUnscoped: track("evaluateTrial", true),
      setLastUsedCompanyUnscoped: track("rememberLastUsed", undefined),
    };
    registration = { createCompanyAndUser: track("createCompany", owner) };
    eventService = { publish: track("publish", undefined) };
  });

  it("locks the login, decides the trial and creates the workspace and its events in one transaction", async () => {
    const result = await interactor().invoke({ name: "Taxes", agreeToTerms: true });

    expect(result).toEqual({ ok: true, data: { companyId: "company-new", slug: "taxes", trial: false } });
    expect(calls.order).toEqual([
      "timeout:15000",
      "begin",
      "lockLogin",
      "countCreated",
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
  });

  it("refuses a further cloud workspace once the login created the limit", async () => {
    repo.countCreatedWorkspacesUnscoped.mockResolvedValue(20);

    const result = await interactor().invoke({ name: "One too many", agreeToTerms: true });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(interactorFailureCodes(result.error)).toEqual([CustomErrorCode.workspaceLimitReached]);
    expect(registration.createCompanyAndUser).not.toHaveBeenCalled();
    expect(repo.setLastUsedCompanyUnscoped).not.toHaveBeenCalled();
  });

  it("does not limit how many workspaces a self-hosted login creates", async () => {
    mutableEnv.APP_MODE = "self-hosted";
    repo.countCreatedWorkspacesUnscoped.mockResolvedValue(500);

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
});
