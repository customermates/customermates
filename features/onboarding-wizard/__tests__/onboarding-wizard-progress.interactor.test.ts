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
const progress = { ...readOnboardingWizardProgress(null), step: "ai" as const };
const repo = { findOnboardingWizardProgressOrThrow: vi.fn(), saveOnboardingWizardProgress: vi.fn() };
const guard = { resolveAccountState: vi.fn() };
const auth = { resolveApiKeyReferences: vi.fn() };
const read = () => new GetOnboardingWizardProgressInteractor(repo as never, guard as never, auth as never);
const save = () => new SaveOnboardingWizardProgressInteractor(repo as never, guard as never, auth as never);

beforeEach(() => {
  vi.clearAllMocks();
  (MOCK_ENV_MODULE.env as { APP_MODE: string }).APP_MODE = "cloud";
  guard.resolveAccountState.mockResolvedValue({ state: "onboarding", user });
  repo.findOnboardingWizardProgressOrThrow.mockResolvedValue(progress);
  repo.saveOnboardingWizardProgress.mockResolvedValue(true);
  auth.resolveApiKeyReferences.mockResolvedValue({ active: new Set(), foreign: new Set() });
});

describe("onboarding progress access and persistence", () => {
  it("restores a registered user's persisted step without overwriting it", async () => {
    await expect(read().invoke()).resolves.toEqual({ ok: true, data: progress });
    expect(repo.saveOnboardingWizardProgress).not.toHaveBeenCalled();
  });

  it.each([null, {}, { step: "unknown" }, { ...progress, secret: "not-progress" }])(
    "starts legacy or malformed progress at Invite (%j)",
    async (stored) => {
      repo.findOnboardingWizardProgressOrThrow.mockResolvedValue(stored);
      await expect(read().invoke()).resolves.toEqual({ ok: true, data: readOnboardingWizardProgress(null) });
    },
  );

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
    guard.resolveAccountState.mockResolvedValue({ state: "onboarding", user });
    expect(await save().invoke({ userId: "previous-account", progress })).toMatchObject({ ok: false });
    expect(repo.saveOnboardingWizardProgress).not.toHaveBeenCalled();
  });

  it("rejects secret-bearing or invalid step inputs before a repository write", async () => {
    for (const invalid of [
      { ...progress, step: "profile" },
      { ...progress, ai: { ...progress.ai, key: "not-progress" } },
      { ...progress, inviteTab: "unknown" },
    ])
      expect(await save().invoke({ userId: user.id, progress: invalid } as never)).toMatchObject({ ok: false });
    expect(repo.saveOnboardingWizardProgress).not.toHaveBeenCalled();
  });

  it("restores only current, enabled API-key references owned by this session", async () => {
    repo.findOnboardingWizardProgressOrThrow.mockResolvedValue({
      ...progress,
      ai: {
        ...progress.ai,
        apiKeyIds: { cursor: "valid", codex: "expired", gemini: "disabled", claudeCode: "another-user" },
      },
    });
    auth.resolveApiKeyReferences.mockResolvedValue({ active: new Set(["valid"]), foreign: new Set(["another-user"]) });
    expect(await read().invoke()).toMatchObject({ ok: true, data: { ai: { apiKeyIds: { cursor: "valid" } } } });
  });

  it("refuses to save an API-key reference from another user", async () => {
    auth.resolveApiKeyReferences.mockResolvedValue({ active: new Set(), foreign: new Set(["another-user"]) });
    expect(
      await save().invoke({
        userId: user.id,
        progress: { ...progress, ai: { ...progress.ai, apiKeyIds: { cursor: "another-user" } } },
      }),
    ).toMatchObject({ ok: false });
    expect(repo.saveOnboardingWizardProgress).not.toHaveBeenCalled();
  });

  it("drops the user's own deleted, disabled or expired key references instead of blocking the save", async () => {
    auth.resolveApiKeyReferences.mockResolvedValue({ active: new Set(["valid"]), foreign: new Set() });
    const stale = {
      ...progress,
      ai: { ...progress.ai, apiKeyIds: { cursor: "valid", codex: "deleted", gemini: "disabled" } },
    };
    const pruned = { ...progress, ai: { ...progress.ai, apiKeyIds: { cursor: "valid" } } };

    await expect(save().invoke({ userId: user.id, progress: stale })).resolves.toEqual({ ok: true, data: pruned });
    expect(auth.resolveApiKeyReferences).toHaveBeenCalledWith(["valid", "deleted", "disabled"]);
    expect(repo.saveOnboardingWizardProgress).toHaveBeenCalledExactlyOnceWith(pruned);
  });

  it("cannot reopen onboarding if completion races the save", async () => {
    repo.saveOnboardingWizardProgress.mockResolvedValue(false);
    await expect(save().invoke({ userId: user.id, progress })).resolves.toEqual({ redirect: "/" });
  });
});
