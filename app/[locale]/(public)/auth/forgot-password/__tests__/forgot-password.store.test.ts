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

  it("submits the active onboarding intent with the email", async () => {
    const store = new ForgotPasswordStore(rootStore);
    store.onChange("email", "invited@example.com");
    store.onChange("confirmEmail", "invited@example.com");
    store.setOnboardingIntent("signed.intent");

    await store.onSubmit();

    expect(actions.requestPasswordResetAction).toHaveBeenCalledWith(
      { confirmEmail: "invited@example.com", email: "invited@example.com" },
      "signed.intent",
    );
  });
});
