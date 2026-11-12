import { beforeEach, describe, expect, it, vi } from "vitest";

import { ACCOUNT_STATES, accountStateRedirect } from "@/features/auth/account-state";
import { createMockUser, createMockUserWithPermissions } from "@/tests/helpers/mock-user";
import { MOCK_ENV_MODULE } from "@/tests/helpers/interactor-test-setup";

vi.mock("@/env", () => MOCK_ENV_MODULE);

import { SelectOnboardingJobInteractor } from "../select-onboarding-job.interactor";

const owner = { ...createMockUser({ onboardingWikiStepCompletedAt: null }), company: { slug: "atlas-studio" } };

describe("SelectOnboardingJobInteractor", () => {
  let funnel: { recordFunnelEvent: ReturnType<typeof vi.fn> };
  let setupStep: {
    markOnboardingSetupStepCompleted: ReturnType<typeof vi.fn>;
    reopenOnboardingSetupStep: ReturnType<typeof vi.fn>;
  };
  let routeGuardService: { resolveAccountState: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    (MOCK_ENV_MODULE.env as { APP_MODE: "cloud" | "demo" | "self-hosted" }).APP_MODE = "cloud";
    funnel = { recordFunnelEvent: vi.fn().mockResolvedValue(true) };
    setupStep = {
      markOnboardingSetupStepCompleted: vi.fn().mockResolvedValue(undefined),
      reopenOnboardingSetupStep: vi.fn().mockResolvedValue(undefined),
    };
    routeGuardService = { resolveAccountState: vi.fn().mockResolvedValue({ state: "onboarding", user: owner }) };
  });

  const interactor = () =>
    new SelectOnboardingJobInteractor(funnel as never, setupStep as never, routeGuardService as never);

  it("records the choice and continues to the AI setup interview for the workspace job", async () => {
    await expect(interactor().invoke({ job: "workspace" })).resolves.toEqual({
      ok: true,
      data: { job: "workspace", next: "setup" },
    });
    expect(funnel.recordFunnelEvent).toHaveBeenCalledExactlyOnceWith({
      type: "jobSelected",
      occurredAt: expect.any(Date),
      job: "workspace",
    });
    expect(setupStep.markOnboardingSetupStepCompleted).not.toHaveBeenCalled();
    expect(setupStep.reopenOnboardingSetupStep).toHaveBeenCalledExactlyOnceWith({ userId: owner.id });
  });

  it("skips the setup interview and opens the AI connection for the agent job", async () => {
    await expect(interactor().invoke({ job: "agent" })).resolves.toEqual({
      ok: true,
      data: { job: "agent", next: "ai" },
    });
    expect(setupStep.markOnboardingSetupStepCompleted).toHaveBeenCalledExactlyOnceWith({ userId: owner.id });
    expect(setupStep.reopenOnboardingSetupStep).not.toHaveBeenCalled();
  });

  it("continues to the job playbook for the follow-up job and keeps onboarding open", async () => {
    await expect(interactor().invoke({ job: "followup" })).resolves.toEqual({
      ok: true,
      data: { job: "followup", next: "playbook" },
    });
    expect(funnel.recordFunnelEvent).toHaveBeenCalledExactlyOnceWith({
      type: "jobSelected",
      occurredAt: expect.any(Date),
      job: "followup",
    });
    expect(setupStep.markOnboardingSetupStepCompleted).not.toHaveBeenCalled();
  });

  it("rejects a job outside the allowed set without writing", async () => {
    const result = await interactor().invoke({ job: "admin" } as never);
    expect(result).toMatchObject({ ok: false });
    expect(funnel.recordFunnelEvent).not.toHaveBeenCalled();
  });

  it("redirects invited members without writing", async () => {
    routeGuardService.resolveAccountState.mockResolvedValue({
      state: "onboarding",
      user: createMockUserWithPermissions([]),
    });

    await expect(interactor().invoke({ job: "agent" })).resolves.toEqual({ redirect: "/" });
    expect(funnel.recordFunnelEvent).not.toHaveBeenCalled();
  });

  it.each(ACCOUNT_STATES.filter((state) => state !== "onboarding"))(
    "redirects the %s state without writing",
    async (state) => {
      routeGuardService.resolveAccountState.mockResolvedValue({ state, user: owner });
      await expect(interactor().invoke({ job: "workspace" })).resolves.toEqual({
        redirect: accountStateRedirect(state) ?? "/",
      });
      expect(funnel.recordFunnelEvent).not.toHaveBeenCalled();
    },
  );
});
