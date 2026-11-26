import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockUser } from "@/tests/helpers/mock-user";
import { MOCK_ENV_MODULE, MOCK_ZOD_MODULE } from "@/tests/helpers/interactor-test-setup";

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("next-intl/server", () => ({
  getTranslations: () => Promise.resolve(Object.assign((key: string) => key, { raw: (key: string) => key })),
}));

import { ACCOUNT_STATES, accountStateRedirect } from "@/features/auth/account-state";
import { GetOnboardingWizardProgressInteractor } from "../get-onboarding-wizard-progress.interactor";
import { SaveOnboardingWizardProgressInteractor } from "../save-onboarding-wizard-progress.interactor";
import { readOnboardingWizardProgress } from "../onboarding-wizard-progress.schema";

const user = createMockUser({ onboardingWizardCompletedAt: null });
const sessionUser = { id: "auth-user-id" };
const progress = { step: "channel" as const, inviteTab: "email" as const };
const repo = { findOnboardingWizardProgressOrThrow: vi.fn(), saveOnboardingWizardProgress: vi.fn() };
const guard = { resolveAccountState: vi.fn() };
const read = () => new GetOnboardingWizardProgressInteractor(repo as never, guard as never);
const save = () => new SaveOnboardingWizardProgressInteractor(repo as never, guard as never);

beforeEach(() => {
  vi.clearAllMocks();
  (MOCK_ENV_MODULE.env as { APP_MODE: string }).APP_MODE = "cloud";
  guard.resolveAccountState.mockResolvedValue({ state: "onboarding", user, sessionUser });
  repo.findOnboardingWizardProgressOrThrow.mockResolvedValue(progress);
  repo.saveOnboardingWizardProgress.mockResolvedValue(true);
});

describe("onboarding progress access and persistence", () => {
  it("restores a registered user's persisted step without overwriting it", async () => {
    await expect(read().invoke()).resolves.toEqual({ ok: true, data: progress });
    expect(repo.saveOnboardingWizardProgress).not.toHaveBeenCalled();
  });

  it.each([null, {}, { step: "unknown" }, { step: "ai", inviteTab: "link" }, { step: "goal", inviteTab: "link" }])(
    "starts legacy or malformed progress at Invite (%j)",
    async (stored) => {
      repo.findOnboardingWizardProgressOrThrow.mockResolvedValue(stored);
      await expect(read().invoke()).resolves.toEqual({ ok: true, data: readOnboardingWizardProgress(null) });
    },
  );

  it("keeps the step and tab of progress saved with the old agent fields", async () => {
    repo.findOnboardingWizardProgressOrThrow.mockResolvedValue({
      ...progress,
      ai: { apiKeyIds: { cursor: "key" } },
      job: "agent",
      schemaBaseline: 3,
    });
    await expect(read().invoke()).resolves.toEqual({ ok: true, data: progress });
  });

  it("saves a complete typed snapshot for the authenticated owner", async () => {
    await expect(save().invoke({ userId: user.id, progress })).resolves.toEqual({ ok: true, data: progress });
    expect(repo.saveOnboardingWizardProgress).toHaveBeenCalledExactlyOnceWith(progress);
  });

  it.each(ACCOUNT_STATES.filter((state) => state !== "onboarding"))(
    "never reads or writes progress in the %s account state",
    async (state) => {
      guard.resolveAccountState.mockResolvedValue({ state, user });
      const redirect = { redirect: accountStateRedirect(state) ?? "/" };
      await expect(read().invoke()).resolves.toEqual(redirect);
      await expect(save().invoke({ userId: user.id, progress })).resolves.toEqual(redirect);
      expect(repo.findOnboardingWizardProgressOrThrow).not.toHaveBeenCalled();
      expect(repo.saveOnboardingWizardProgress).not.toHaveBeenCalled();
    },
  );

  it("fails closed on missing identity or a previous account's pending save", async () => {
    guard.resolveAccountState.mockResolvedValue({ state: "onboarding", user: null });
    await expect(read().invoke()).resolves.toEqual({ redirect: "/auth/signin" });
    await expect(save().invoke({ userId: user.id, progress })).resolves.toEqual({ redirect: "/auth/signin" });
    guard.resolveAccountState.mockResolvedValue({ state: "onboarding", user, sessionUser });
    expect(await save().invoke({ userId: "previous-account", progress })).toMatchObject({ ok: false });
    expect(repo.saveOnboardingWizardProgress).not.toHaveBeenCalled();
  });

  it("rejects extra fields and invalid steps before a repository write", async () => {
    for (const invalid of [
      { ...progress, step: "profile" },
      { ...progress, step: "goal" },
      { ...progress, ai: { apiKeyIds: {} } },
      { ...progress, inviteTab: "unknown" },
    ])
      expect(await save().invoke({ userId: user.id, progress: invalid } as never)).toMatchObject({ ok: false });
    expect(repo.saveOnboardingWizardProgress).not.toHaveBeenCalled();
  });

  it("cannot reopen onboarding if completion races the save", async () => {
    repo.saveOnboardingWizardProgress.mockResolvedValue(false);
    await expect(save().invoke({ userId: user.id, progress })).resolves.toEqual({ redirect: "/" });
  });
});
