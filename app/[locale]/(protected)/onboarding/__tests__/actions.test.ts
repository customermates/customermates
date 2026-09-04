import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ chooseWorkspace: vi.fn(), redirect: vi.fn() }));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next-intl/server", () => ({ getLocale: () => Promise.resolve("en") }));
vi.mock("@/core/di", () => ({ getChooseWorkspaceOnboardingInteractor: () => ({ invoke: mocks.chooseWorkspace }) }));

import { chooseWorkspaceAction } from "../actions";

describe("onboarding workspace choice action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("adapts the submitted choice and localizes the interactor redirect", async () => {
    mocks.chooseWorkspace.mockResolvedValue({ redirect: "/onboarding/join" });
    const formData = new FormData();
    formData.set("workspaceChoice", "join");

    await chooseWorkspaceAction(null, formData);

    expect(mocks.chooseWorkspace).toHaveBeenCalledExactlyOnceWith({ choice: "join" });
    expect(mocks.redirect).toHaveBeenCalledExactlyOnceWith("/en/onboarding/join");
  });

  it("returns without redirecting when the interactor rejects the choice", async () => {
    mocks.chooseWorkspace.mockResolvedValue(null);
    const formData = new FormData();
    formData.set("workspaceChoice", "unknown");

    await expect(chooseWorkspaceAction(null, formData)).resolves.toBeNull();

    expect(mocks.chooseWorkspace).toHaveBeenCalledExactlyOnceWith({ choice: "unknown" });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
