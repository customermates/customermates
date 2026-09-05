import type { RootStore } from "@/core/stores/root.store";

import { beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({ resetPasswordAction: vi.fn() }));

vi.mock("../../actions", () => actions);

import { ResetPasswordStore } from "../reset-password.store";

const rootStore = {} as RootStore;

describe("ResetPasswordStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    actions.resetPasswordAction.mockResolvedValue({ ok: true, data: null });
  });

  it("refreshes, resets and clears intent within the submitted form snapshot", async () => {
    actions.resetPasswordAction.mockResolvedValue({ ok: true, data: null });
    const store = new ResetPasswordStore(rootStore);
    store.onInitOrRefresh({ onboardingIntent: "invite-a" });
    store.onChange("token", "reset-token");
    store.onInitOrRefresh({ onboardingIntent: "invite-b" });
    store.onChange("onboardingIntent", "unsaved-intent");
    store.resetForm();

    await store.onSubmit();

    expect(actions.resetPasswordAction).toHaveBeenLastCalledWith(
      expect.objectContaining({ token: "reset-token", onboardingIntent: "invite-b" }),
    );
    store.onInitOrRefresh({ onboardingIntent: undefined });
    await store.onSubmit();

    expect(actions.resetPasswordAction).toHaveBeenLastCalledWith(
      expect.objectContaining({ token: "reset-token", onboardingIntent: undefined }),
    );
    expect(store.savedState.onboardingIntent).toBeUndefined();
  });

  it("submits the active onboarding intent with the reset token", async () => {
    const store = new ResetPasswordStore(rootStore);
    store.onInitOrRefresh({ token: "reset-token" });
    store.onChange("password", "ValidPass1!");
    store.onChange("confirmPassword", "ValidPass1!");
    store.onInitOrRefresh({ onboardingIntent: "signed.intent" });

    await store.onSubmit();

    expect(actions.resetPasswordAction).toHaveBeenCalledWith({
      confirmPassword: "ValidPass1!",
      password: "ValidPass1!",
      token: "reset-token",
      onboardingIntent: "signed.intent",
    });
  });
});
