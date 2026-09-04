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

  it("submits the active onboarding intent with the reset token", async () => {
    const store = new ResetPasswordStore(rootStore);
    store.onInitOrRefresh({ token: "reset-token" });
    store.onChange("password", "ValidPass1!");
    store.onChange("confirmPassword", "ValidPass1!");
    store.setOnboardingIntent("signed.intent");

    await store.onSubmit();

    expect(actions.resetPasswordAction).toHaveBeenCalledWith(
      {
        confirmPassword: "ValidPass1!",
        password: "ValidPass1!",
        token: "reset-token",
      },
      "signed.intent",
    );
  });
});
