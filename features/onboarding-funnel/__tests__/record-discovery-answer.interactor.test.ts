import { beforeEach, describe, expect, it, vi } from "vitest";

import { ACCOUNT_STATES, accountStateRedirect } from "@/features/auth/account-state";
import { createMockUser, createMockUserWithPermissions } from "@/tests/helpers/mock-user";
import { MOCK_ENV_MODULE } from "@/tests/helpers/interactor-test-setup";

vi.mock("@/env", () => MOCK_ENV_MODULE);

import { DISCOVERY_CHOICES, DISCOVERY_DETAIL_MAX_LENGTH, parseDiscoveryChoice } from "../discovery-answer";
import { RecordDiscoveryAnswerInteractor } from "../record-discovery-answer.interactor";

const owner = { ...createMockUser({ onboardingWikiStepCompletedAt: null }), company: { slug: "atlas-studio" } };

describe("RecordDiscoveryAnswerInteractor", () => {
  let repo: { recordDiscoveryAnswer: ReturnType<typeof vi.fn> };
  let routeGuardService: { resolveAccountState: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    (MOCK_ENV_MODULE.env as { APP_MODE: "cloud" | "demo" | "self-hosted" }).APP_MODE = "cloud";
    repo = { recordDiscoveryAnswer: vi.fn().mockResolvedValue(true) };
    routeGuardService = { resolveAccountState: vi.fn().mockResolvedValue({ state: "onboarding", user: owner }) };
  });

  const interactor = () => new RecordDiscoveryAnswerInteractor(repo as never, routeGuardService as never);

  it.each(DISCOVERY_CHOICES.filter((choice) => choice !== "other"))(
    "stores the choice %s for the owner",
    async (choice) => {
      await expect(interactor().invoke({ choice })).resolves.toEqual({ ok: true, data: { recorded: true } });
      expect(repo.recordDiscoveryAnswer).toHaveBeenCalledExactlyOnceWith({ userId: owner.id, choice, detail: null });
    },
  );

  it("stores the short free text only with the other choice", async () => {
    await interactor().invoke({ choice: "other", detail: "  a podcast  " });
    expect(repo.recordDiscoveryAnswer).toHaveBeenLastCalledWith({
      userId: owner.id,
      choice: "other",
      detail: "a podcast",
    });

    await interactor().invoke({ choice: "directory", detail: "a podcast" });
    expect(repo.recordDiscoveryAnswer).toHaveBeenLastCalledWith({
      userId: owner.id,
      choice: "directory",
      detail: null,
    });
  });

  it("stores a skipped step as a null choice so the step is not asked again", async () => {
    await expect(interactor().invoke({ choice: null })).resolves.toEqual({ ok: true, data: { recorded: true } });
    expect(repo.recordDiscoveryAnswer).toHaveBeenCalledExactlyOnceWith({
      userId: owner.id,
      choice: null,
      detail: null,
    });
  });

  it("reports that nothing was recorded when the question was already answered", async () => {
    repo.recordDiscoveryAnswer.mockResolvedValue(false);

    await expect(interactor().invoke({ choice: "searchEngine" })).resolves.toEqual({
      ok: true,
      data: { recorded: false },
    });
  });

  it.each([
    ["an unknown choice", { choice: "billboard" }],
    ["free text that is too long", { choice: "other", detail: "x".repeat(DISCOVERY_DETAIL_MAX_LENGTH + 1) }],
    ["an extra field", { choice: "other", answered: true }],
    ["no choice at all", {}],
  ])("rejects %s without writing", async (_, data) => {
    expect(await interactor().invoke(data as never)).toMatchObject({ ok: false });
    expect(repo.recordDiscoveryAnswer).not.toHaveBeenCalled();
  });

  it("records nothing outside the managed cloud service", async () => {
    (MOCK_ENV_MODULE.env as { APP_MODE: "cloud" | "demo" | "self-hosted" }).APP_MODE = "self-hosted";

    await expect(interactor().invoke({ choice: "searchEngine" })).resolves.toEqual({
      ok: true,
      data: { recorded: false },
    });
    expect(repo.recordDiscoveryAnswer).not.toHaveBeenCalled();
  });

  it("keeps invited members out of the question", async () => {
    routeGuardService.resolveAccountState.mockResolvedValue({
      state: "onboarding",
      user: createMockUserWithPermissions([]),
    });

    await expect(interactor().invoke({ choice: "searchEngine" })).resolves.toEqual({ redirect: "/" });
    expect(repo.recordDiscoveryAnswer).not.toHaveBeenCalled();
  });

  it("redirects a visitor without a registered user", async () => {
    routeGuardService.resolveAccountState.mockResolvedValue({ state: "onboarding", user: null });

    await expect(interactor().invoke({ choice: "searchEngine" })).resolves.toEqual({ redirect: "/auth/signin" });
    expect(repo.recordDiscoveryAnswer).not.toHaveBeenCalled();
  });

  it.each(ACCOUNT_STATES.filter((state) => state !== "onboarding"))(
    "redirects the %s state without writing",
    async (state) => {
      routeGuardService.resolveAccountState.mockResolvedValue({ state, user: owner });

      await expect(interactor().invoke({ choice: "searchEngine" })).resolves.toEqual({
        redirect: accountStateRedirect(state) ?? "/",
      });
      expect(repo.recordDiscoveryAnswer).not.toHaveBeenCalled();
    },
  );
});

describe("parseDiscoveryChoice", () => {
  it("accepts only the offered choices", () => {
    expect(parseDiscoveryChoice("aiAssistant")).toBe("aiAssistant");
    expect(parseDiscoveryChoice("constructor")).toBeNull();
    expect(parseDiscoveryChoice(undefined)).toBeNull();
  });
});
