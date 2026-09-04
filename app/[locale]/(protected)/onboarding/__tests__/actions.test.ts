import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  clearInviteTokenCookie: vi.fn(),
  issueCreateCompanyOnboardingIntent: vi.fn(),
  redirect: vi.fn(),
  requireAccountState: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next-intl/server", () => ({ getLocale: () => Promise.resolve("en") }));
vi.mock("@/features/auth/next/require", () => ({
  requireAccountState: mocks.requireAccountState,
}));
vi.mock("@/features/company/next/invite-token-cookie", () => ({
  clearInviteTokenCookie: mocks.clearInviteTokenCookie,
}));
vi.mock("@/features/company/next/onboarding-intent", () => ({
  issueCreateCompanyOnboardingIntent: mocks.issueCreateCompanyOnboardingIntent,
}));

import { chooseCreateWorkspaceAction, chooseJoinWorkspaceAction, chooseWorkspaceAction } from "../actions";

describe("onboarding workspace choice actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAccountState.mockResolvedValue({
      state: "unregistered",
      sessionUser: { id: "user-one" },
    });
    mocks.clearInviteTokenCookie.mockResolvedValue(undefined);
    mocks.issueCreateCompanyOnboardingIntent.mockReturnValue("signed-create-intent");
  });

  it("binds an explicit create decision to the current identity and URL", async () => {
    await chooseCreateWorkspaceAction();

    expect(mocks.requireAccountState).toHaveBeenCalledWith("unregistered");
    expect(mocks.clearInviteTokenCookie).toHaveBeenCalledOnce();
    expect(mocks.issueCreateCompanyOnboardingIntent).toHaveBeenCalledWith("user-one");
    expect(mocks.clearInviteTokenCookie.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.issueCreateCompanyOnboardingIntent.mock.invocationCallOrder[0],
    );
    expect(mocks.redirect).toHaveBeenCalledWith("/en/onboarding/wizard?intent=signed-create-intent");
  });

  it("clears ambient invitation state before showing join instructions", async () => {
    await chooseJoinWorkspaceAction();

    expect(mocks.requireAccountState).toHaveBeenCalledWith("unregistered");
    expect(mocks.clearInviteTokenCookie).toHaveBeenCalledOnce();
    expect(mocks.issueCreateCompanyOnboardingIntent).not.toHaveBeenCalled();
    expect(mocks.redirect).toHaveBeenCalledWith("/en/onboarding/join");
  });

  it.each([
    ["create", "/en/onboarding/wizard?intent=signed-create-intent"],
    ["join", "/en/onboarding/join"],
  ])("dispatches the %s form choice", async (choice, target) => {
    const formData = new FormData();
    formData.set("workspaceChoice", choice);

    await chooseWorkspaceAction(null, formData);

    expect(mocks.redirect).toHaveBeenCalledWith(target);
  });

  it("ignores an unknown form choice", async () => {
    const formData = new FormData();
    formData.set("workspaceChoice", "unknown");

    await expect(chooseWorkspaceAction(null, formData)).resolves.toBeNull();

    expect(mocks.requireAccountState).not.toHaveBeenCalled();
    expect(mocks.clearInviteTokenCookie).not.toHaveBeenCalled();
    expect(mocks.issueCreateCompanyOnboardingIntent).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
