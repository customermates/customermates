import { beforeEach, describe, expect, it, vi } from "vitest";

import { ChooseWorkspaceOnboardingInteractor } from "../choose-workspace-onboarding.interactor";

describe("ChooseWorkspaceOnboardingInteractor", () => {
  const routeGuardService = { resolveAccountState: vi.fn() };
  const onboardingIntentService = { issueCreateCompany: vi.fn() };
  const inviteTokenCookieRepo = { clear: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    routeGuardService.resolveAccountState.mockResolvedValue({
      state: "unregistered",
      sessionUser: { id: "auth-user-one" },
    });
    onboardingIntentService.issueCreateCompany.mockReturnValue("signed-create-intent");
    inviteTokenCookieRepo.clear.mockResolvedValue(undefined);
  });

  function createInteractor() {
    return new ChooseWorkspaceOnboardingInteractor(
      routeGuardService as never,
      onboardingIntentService as never,
      inviteTokenCookieRepo as never,
    );
  }

  it("binds company creation to the signed-in identity", async () => {
    await expect(createInteractor().invoke({ choice: "create" })).resolves.toEqual({
      redirect: "/onboarding/wizard?intent=signed-create-intent",
    });
    expect(onboardingIntentService.issueCreateCompany).toHaveBeenCalledExactlyOnceWith("auth-user-one");
    expect(inviteTokenCookieRepo.clear).toHaveBeenCalledOnce();
  });

  it("routes join intent to instructions without issuing a creation intent", async () => {
    await expect(createInteractor().invoke({ choice: "join" })).resolves.toEqual({ redirect: "/onboarding/join" });
    expect(onboardingIntentService.issueCreateCompany).not.toHaveBeenCalled();
    expect(inviteTokenCookieRepo.clear).toHaveBeenCalledOnce();
  });

  it("rejects an unknown choice without reading account state", async () => {
    await expect(createInteractor().invoke({ choice: "unknown" })).resolves.toBeNull();
    expect(routeGuardService.resolveAccountState).not.toHaveBeenCalled();
    expect(inviteTokenCookieRepo.clear).not.toHaveBeenCalled();
  });

  it("redirects account states that are not eligible for workspace choice", async () => {
    routeGuardService.resolveAccountState.mockResolvedValue({ state: "pending", sessionUser: { id: "auth-user-one" } });

    await expect(createInteractor().invoke({ choice: "create" })).resolves.toEqual({ redirect: "/auth/pending" });
    expect(inviteTokenCookieRepo.clear).not.toHaveBeenCalled();
  });
});
