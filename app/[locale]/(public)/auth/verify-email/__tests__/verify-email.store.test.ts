import type { RootStore } from "@/core/stores/root.store";

import { beforeEach, describe, expect, it, vi } from "vitest";

const authActions = vi.hoisted(() => ({
  resendVerificationEmailFromAuthAction: vi.fn(),
}));

vi.mock("@/app/[locale]/(public)/auth/actions", () => authActions);
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { VerifyEmailStore } from "../verify-email.store";

const rootStore = {
  loadingOverlayStore: {
    withLoading: (callback: () => Promise<void>) => callback(),
  },
  localeStore: { getTranslation: (key: string) => key },
} as unknown as RootStore;

beforeEach(() => {
  vi.clearAllMocks();
  authActions.resendVerificationEmailFromAuthAction.mockResolvedValue({
    ok: true,
  });
});

describe("VerifyEmailStore", () => {
  it("scopes the sent state to the active session email", async () => {
    const store = new VerifyEmailStore(rootStore);
    store.activate("first@example.test");

    await store.resend();
    expect(store.isSent).toBe(true);

    store.activate("second@example.test");
    expect(store.isSent).toBe(false);

    await store.resend();
    expect(store.isSent).toBe(true);

    store.deactivate("second@example.test");
    expect(store.isSent).toBe(false);
  });

  it("ignores a resend completion after the active account changes", async () => {
    let resolveRequest: ((result: { ok: boolean }) => void) | undefined;
    authActions.resendVerificationEmailFromAuthAction.mockReturnValue(
      new Promise((resolve) => {
        resolveRequest = resolve;
      }),
    );
    const store = new VerifyEmailStore(rootStore);
    store.activate("first@example.test");

    const resend = store.resend();
    store.activate("second@example.test");
    resolveRequest?.({ ok: true });
    await resend;

    expect(store.isSent).toBe(false);
  });
});
