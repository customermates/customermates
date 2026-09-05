import type { RootStore } from "@/core/stores/root.store";

import { beforeEach, describe, expect, it, vi } from "vitest";

const authActions = vi.hoisted(() => ({
  signUpWithEmailAction: vi.fn(),
  continueWithGoogleAction: vi.fn(),
  continueWithMicrosoftAction: vi.fn(),
}));
const toastZodErrorTree = vi.hoisted(() => vi.fn());

vi.mock("@/app/[locale]/(public)/auth/actions", () => authActions);
vi.mock("@/core/utils/toast-zod-error-tree", () => ({ toastZodErrorTree }));

import { SignUpStore } from "../sign-up.store";

const assign = vi.fn();
const rootStore = {} as RootStore;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("window", { location: { assign } });
});

describe("SignUpStore social continuation", () => {
  it("uses refreshed and cleared form intent for both provider callbacks", async () => {
    authActions.continueWithMicrosoftAction.mockResolvedValue({ ok: true, data: { url: null } });
    const store = new SignUpStore(rootStore);
    store.onInitOrRefresh({ onboardingIntent: "invite-a" });
    store.onInitOrRefresh({ onboardingIntent: "invite-b" });
    await store.continueWithProvider("microsoft");
    expect(authActions.continueWithMicrosoftAction).toHaveBeenLastCalledWith(
      "/auth/invitation?intent=invite-b",
      "/auth/signup?intent=invite-b",
    );

    store.onInitOrRefresh({ onboardingIntent: undefined });
    await store.continueWithProvider("microsoft");
    expect(authActions.continueWithMicrosoftAction).toHaveBeenLastCalledWith("/onboarding", "/auth/signup");
  });

  it("refreshes, resets and clears intent within the submitted form snapshot", async () => {
    authActions.signUpWithEmailAction.mockResolvedValue({ ok: true, data: null });
    const store = new SignUpStore(rootStore);
    store.onInitOrRefresh({ onboardingIntent: "invite-a" });
    store.onChange("email", "invited@example.com");
    store.onInitOrRefresh({ onboardingIntent: "invite-b" });
    store.onChange("onboardingIntent", "unsaved-intent");
    store.resetForm();

    await store.onSubmit();

    expect(authActions.signUpWithEmailAction).toHaveBeenLastCalledWith(
      expect.objectContaining({ email: "invited@example.com", onboardingIntent: "invite-b" }),
    );
    store.onInitOrRefresh({ onboardingIntent: undefined });
    await store.onSubmit();

    expect(authActions.signUpWithEmailAction).toHaveBeenLastCalledWith(
      expect.objectContaining({ email: "invited@example.com", onboardingIntent: undefined }),
    );
    expect(store.savedState.onboardingIntent).toBeUndefined();
  });

  it("submits email signup with the active invitation intent", async () => {
    authActions.signUpWithEmailAction.mockResolvedValue({ ok: true, data: null });
    const store = new SignUpStore(rootStore);
    store.onInitOrRefresh({ onboardingIntent: "signed.intent" });

    await store.onSubmit();

    expect(authActions.signUpWithEmailAction).toHaveBeenCalledWith(
      expect.objectContaining({ email: "", onboardingIntent: "signed.intent" }),
    );
  });

  it("keeps the invitation in provider success and error callbacks", async () => {
    authActions.continueWithGoogleAction.mockResolvedValue({
      ok: true,
      data: { url: "https://accounts.google.test/authorize" },
    });
    const store = new SignUpStore(rootStore);
    store.onInitOrRefresh({ onboardingIntent: "signed.intent" });

    await store.continueWithProvider("google");

    expect(authActions.continueWithGoogleAction).toHaveBeenCalledWith(
      "/auth/invitation?intent=signed.intent",
      "/auth/signup?intent=signed.intent",
    );
  });

  it("keeps both providers locked after hard navigation starts", async () => {
    authActions.continueWithGoogleAction.mockResolvedValue({
      ok: true,
      data: { url: "https://accounts.google.test/authorize" },
    });
    const store = new SignUpStore(rootStore);

    await store.continueWithProvider("google");
    await store.continueWithProvider("google");

    expect(authActions.continueWithGoogleAction).toHaveBeenCalledExactlyOnceWith("/onboarding", "/auth/signup");
    expect(assign).toHaveBeenCalledExactlyOnceWith("https://accounts.google.test/authorize");
    expect(store.isLoading).toBe(true);
  });

  it("releases the provider lock after a validation failure", async () => {
    const error = { errors: ["Social sign-up unavailable"] };
    authActions.continueWithMicrosoftAction.mockResolvedValue({ ok: false, error });
    const store = new SignUpStore(rootStore);

    await store.continueWithProvider("microsoft");

    expect(toastZodErrorTree).toHaveBeenCalledExactlyOnceWith(error);
    expect(assign).not.toHaveBeenCalled();
    expect(store.isLoading).toBe(false);
  });
});
