import { beforeEach, describe, expect, it, vi } from "vitest";

import { DemoModeError } from "@/core/errors/app-errors";
import { ACCOUNT_STATES, accountStateRedirect } from "@/features/auth/account-state";
import { createMockUser, createMockUserWithPermissions } from "@/tests/helpers/mock-user";
import { MOCK_ENV_MODULE } from "@/tests/helpers/interactor-test-setup";

const owner = createMockUser({ onboardingWikiStepCompletedAt: null });

vi.mock("@/env", () => MOCK_ENV_MODULE);

import { CompleteOnboardingWikiStepInteractor } from "../complete-onboarding-wiki-step.interactor";

describe("CompleteOnboardingWikiStepInteractor", () => {
  let repo: { markOnboardingWikiStepCompleted: ReturnType<typeof vi.fn> };
  let routeGuardService: { resolveAccountState: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    (MOCK_ENV_MODULE.env as { APP_MODE: "cloud" | "demo" | "self-hosted" }).APP_MODE = "self-hosted";
    repo = { markOnboardingWikiStepCompleted: vi.fn().mockResolvedValue(undefined) };
    routeGuardService = { resolveAccountState: vi.fn().mockResolvedValue({ state: "onboarding", user: owner }) };
  });

  const interactor = () => new CompleteOnboardingWikiStepInteractor(repo as never, routeGuardService as never);

  it("durably completes the owner-only Wiki step", async () => {
    await expect(interactor().invoke()).resolves.toEqual({ ok: true, data: { completed: true } });
    expect(repo.markOnboardingWikiStepCompleted).toHaveBeenCalledExactlyOnceWith({ userId: owner.id });
  });

  it("redirects invited members without writing", async () => {
    routeGuardService.resolveAccountState.mockResolvedValue({
      state: "onboarding",
      user: createMockUserWithPermissions([]),
    });

    await expect(interactor().invoke()).resolves.toEqual({ redirect: "/" });
    expect(repo.markOnboardingWikiStepCompleted).not.toHaveBeenCalled();
  });

  it.each(ACCOUNT_STATES.filter((state) => state !== "onboarding"))(
    "redirects the %s state without writing",
    async (state) => {
      routeGuardService.resolveAccountState.mockResolvedValue({ state, user: owner });
      await expect(interactor().invoke()).resolves.toEqual({ redirect: accountStateRedirect(state) ?? "/" });
      expect(repo.markOnboardingWikiStepCompleted).not.toHaveBeenCalled();
    },
  );

  it("fails closed when onboarding has no user", async () => {
    routeGuardService.resolveAccountState.mockResolvedValue({ state: "onboarding", user: null });
    await expect(interactor().invoke()).resolves.toEqual({ redirect: "/auth/signin" });
    expect(repo.markOnboardingWikiStepCompleted).not.toHaveBeenCalled();
  });

  it("preserves demo-mode write protection", () => {
    (MOCK_ENV_MODULE.env as { APP_MODE: "cloud" | "demo" | "self-hosted" }).APP_MODE = "demo";
    expect(() => interactor().invoke()).toThrow(DemoModeError);
    expect(repo.markOnboardingWikiStepCompleted).not.toHaveBeenCalled();
  });
});
