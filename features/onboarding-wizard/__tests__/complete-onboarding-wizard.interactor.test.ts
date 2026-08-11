import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockUser } from "@/tests/helpers/mock-user";
import { MOCK_ENV_MODULE } from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser({ onboardingWizardCompletedAt: null });

vi.mock("@/env", () => MOCK_ENV_MODULE);

import { DemoModeError } from "@/core/errors/app-errors";
import { ACCOUNT_STATES, accountStateRedirect } from "@/features/auth/account-state";
import { CompleteOnboardingWizardInteractor } from "../complete-onboarding-wizard.interactor";

describe("CompleteOnboardingWizardInteractor", () => {
  let repo: { markOnboardingWizardCompleted: ReturnType<typeof vi.fn> };
  let accountStateResolver: { resolveAccountState: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    (MOCK_ENV_MODULE.env as { APP_MODE: "cloud" | "demo" | "self-hosted" }).APP_MODE = "self-hosted";
    repo = {
      markOnboardingWizardCompleted: vi.fn().mockResolvedValue(undefined),
    };
    accountStateResolver = {
      resolveAccountState: vi.fn().mockResolvedValue({ state: "onboarding", user: mockUser }),
    };
  });

  function createInteractor() {
    return new CompleteOnboardingWizardInteractor(repo as never, accountStateResolver as never);
  }

  it("completes onboarding for the canonical onboarding state", async () => {
    await expect(createInteractor().invoke()).resolves.toEqual({
      ok: true,
      data: { redirectTo: "/" },
    });

    expect(accountStateResolver.resolveAccountState).toHaveBeenCalledOnce();
    expect(repo.markOnboardingWizardCompleted).toHaveBeenCalledWith({
      userId: mockUser.id,
    });
  });

  it.each(ACCOUNT_STATES.filter((state) => state !== "onboarding"))(
    "redirects the %s state without mutating onboarding",
    async (state) => {
      accountStateResolver.resolveAccountState.mockResolvedValue({ state, user: mockUser });

      await expect(createInteractor().invoke()).resolves.toEqual({ redirect: accountStateRedirect(state) ?? "/" });
      expect(repo.markOnboardingWizardCompleted).not.toHaveBeenCalled();
    },
  );

  it("fails closed when onboarding resolves without a user", async () => {
    accountStateResolver.resolveAccountState.mockResolvedValue({ state: "onboarding", user: null });

    await expect(createInteractor().invoke()).resolves.toEqual({ redirect: "/auth/signin" });
    expect(repo.markOnboardingWizardCompleted).not.toHaveBeenCalled();
  });

  it("preserves the existing demo-mode write restriction", () => {
    (MOCK_ENV_MODULE.env as { APP_MODE: "cloud" | "demo" | "self-hosted" }).APP_MODE = "demo";

    expect(() => createInteractor().invoke()).toThrow(DemoModeError);
    expect(accountStateResolver.resolveAccountState).not.toHaveBeenCalled();
    expect(repo.markOnboardingWizardCompleted).not.toHaveBeenCalled();
  });
});
