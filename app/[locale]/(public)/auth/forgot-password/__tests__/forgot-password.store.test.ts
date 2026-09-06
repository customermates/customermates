import type { RootStore } from "@/core/stores/root.store";

import { beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({ requestPasswordResetAction: vi.fn() }));

vi.mock("@/app/[locale]/(public)/auth/actions", () => actions);
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { ForgotPasswordStore } from "../forgot-password.store";

const rootStore = {
  localeStore: { getTranslation: (key: string) => key },
} as unknown as RootStore;

describe("ForgotPasswordStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    actions.requestPasswordResetAction.mockResolvedValue({ ok: true, data: null });
  });

  it("refreshes, resets and clears intent within the submitted form snapshot", async () => {
    actions.requestPasswordResetAction.mockResolvedValue({ ok: true, data: null });
    const store = new ForgotPasswordStore(rootStore);
    store.onInitOrRefresh({ onboardingIntent: "invite-a" });
    store.onChange("email", "invited@example.com");
    store.onInitOrRefresh({ onboardingIntent: "invite-b" });
    store.onChange("onboardingIntent", "unsaved-intent");
    store.resetForm();

    await store.onSubmit();

    expect(actions.requestPasswordResetAction).toHaveBeenLastCalledWith(
      expect.objectContaining({ email: "invited@example.com", onboardingIntent: "invite-b" }),
    );
    store.onInitOrRefresh({ onboardingIntent: undefined });
    await store.onSubmit();

    expect(actions.requestPasswordResetAction).toHaveBeenLastCalledWith(
      expect.objectContaining({ email: "invited@example.com", onboardingIntent: undefined }),
    );
    expect(store.savedState.onboardingIntent).toBeUndefined();
  });

  it("submits the active onboarding intent with the email", async () => {
    const store = new ForgotPasswordStore(rootStore);
    store.onChange("email", "invited@example.com");
    store.onChange("confirmEmail", "invited@example.com");
    store.onInitOrRefresh({ onboardingIntent: "signed.intent" });

    await store.onSubmit();

    expect(actions.requestPasswordResetAction).toHaveBeenCalledWith({
      confirmEmail: "invited@example.com",
      email: "invited@example.com",
      onboardingIntent: "signed.intent",
    });
  });
});
