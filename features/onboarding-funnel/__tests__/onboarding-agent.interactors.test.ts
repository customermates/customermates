import { beforeEach, describe, expect, it, vi } from "vitest";

import { ACCOUNT_STATES, accountStateRedirect } from "@/features/auth/account-state";
import { runWithTenant } from "@/core/decorators/tenant-context";
import { createMockUser, createMockUserWithPermissions } from "@/tests/helpers/mock-user";
import { MOCK_ENV_MODULE } from "@/tests/helpers/interactor-test-setup";

vi.mock("@/env", () => MOCK_ENV_MODULE);

import { GetOnboardingAgentStatusInteractor } from "../get-onboarding-agent-status.interactor";
import {
  RecordAgentFirstCallInteractor,
  forgetRecordedAgentFirstCalls,
} from "../record-agent-first-call.interactor";

const owner = createMockUser({ onboardingWizardCompletedAt: null });

describe("RecordAgentFirstCallInteractor", () => {
  let repo: { recordAgentFirstCall: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    forgetRecordedAgentFirstCalls();
    (MOCK_ENV_MODULE.env as { APP_MODE: "cloud" | "demo" | "self-hosted" }).APP_MODE = "cloud";
    repo = { recordAgentFirstCall: vi.fn().mockResolvedValue(true) };
  });

  const record = (user = owner) =>
    runWithTenant(user, () => new RecordAgentFirstCallInteractor(repo as never).invoke());

  it("records the first authenticated call of a workspace", async () => {
    await expect(record()).resolves.toEqual({ ok: true, data: { recorded: true } });
    expect(repo.recordAgentFirstCall).toHaveBeenCalledOnce();
  });

  it("asks the database once per workspace and process, then answers from memory", async () => {
    await record();
    await expect(record()).resolves.toEqual({ ok: true, data: { recorded: false } });
    await record();

    expect(repo.recordAgentFirstCall).toHaveBeenCalledOnce();
  });

  it("keeps workspaces apart", async () => {
    await record();
    await record(createMockUser({ companyId: "another-company" }));

    expect(repo.recordAgentFirstCall).toHaveBeenCalledTimes(2);
  });

  it("reports a call that was already stored by an earlier process without writing twice", async () => {
    repo.recordAgentFirstCall.mockResolvedValue(false);

    await expect(record()).resolves.toEqual({ ok: true, data: { recorded: false } });
    await record();

    expect(repo.recordAgentFirstCall).toHaveBeenCalledOnce();
  });

  it("does not remember a workspace when the write failed", async () => {
    repo.recordAgentFirstCall.mockRejectedValueOnce(new Error("database is down"));

    await expect(record()).rejects.toThrow("database is down");
    await expect(record()).resolves.toEqual({ ok: true, data: { recorded: true } });
    expect(repo.recordAgentFirstCall).toHaveBeenCalledTimes(2);
  });
});

describe("GetOnboardingAgentStatusInteractor", () => {
  let repo: { findOnboardingAgentStatus: ReturnType<typeof vi.fn> };
  let routeGuardService: { resolveAccountState: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    repo = { findOnboardingAgentStatus: vi.fn().mockResolvedValue({ connected: true, schemaRevision: 4 }) };
    routeGuardService = { resolveAccountState: vi.fn().mockResolvedValue({ state: "onboarding", user: owner }) };
  });

  const interactor = () => new GetOnboardingAgentStatusInteractor(repo as never, routeGuardService as never);

  it("reports whether the agent has called this workspace and the current model revision", async () => {
    await expect(interactor().invoke()).resolves.toEqual({
      ok: true,
      data: { connected: true, schemaRevision: 4 },
    });
  });

  it("redirects invited members without reading", async () => {
    routeGuardService.resolveAccountState.mockResolvedValue({
      state: "onboarding",
      user: createMockUserWithPermissions([]),
    });

    await expect(interactor().invoke()).resolves.toEqual({ redirect: "/" });
    expect(repo.findOnboardingAgentStatus).not.toHaveBeenCalled();
  });

  it("redirects a visitor without a session to sign-in", async () => {
    routeGuardService.resolveAccountState.mockResolvedValue({ state: "onboarding", user: null });

    await expect(interactor().invoke()).resolves.toEqual({ redirect: "/auth/signin" });
    expect(repo.findOnboardingAgentStatus).not.toHaveBeenCalled();
  });

  it.each(ACCOUNT_STATES.filter((state) => state !== "onboarding"))(
    "redirects the %s state without reading",
    async (state) => {
      routeGuardService.resolveAccountState.mockResolvedValue({ state, user: owner });

      await expect(interactor().invoke()).resolves.toEqual({ redirect: accountStateRedirect(state) ?? "/" });
      expect(repo.findOnboardingAgentStatus).not.toHaveBeenCalled();
    },
  );
});
