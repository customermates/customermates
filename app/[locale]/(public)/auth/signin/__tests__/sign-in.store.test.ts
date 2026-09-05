import type { RootStore } from "@/core/stores/root.store";

import { beforeEach, describe, expect, it, vi } from "vitest";

const authActions = vi.hoisted(() => ({
  signInWithEmailAction: vi.fn(),
  continueWithGoogleAction: vi.fn(),
  continueWithMicrosoftAction: vi.fn(),
}));

vi.mock("@/app/[locale]/(public)/auth/actions", () => authActions);
const toastZodErrorTree = vi.hoisted(() => vi.fn());
vi.mock("@/core/utils/toast-zod-error-tree", () => ({ toastZodErrorTree }));

import { SignInStore } from "../sign-in.store";

const assign = vi.fn();
const rootStore = {} as RootStore;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("window", { location: { assign } });
});

describe("SignInStore", () => {
  it("refreshes and clears callbacks in the form and provider continuation together", async () => {
    authActions.continueWithGoogleAction.mockResolvedValue({ ok: true, data: { url: null } });
    const store = new SignInStore(rootStore);
    store.onInitOrRefresh({ callbackURL: "/auth/invitation?intent=invite-a" });
    store.onChange("email", "invited@example.com");
    store.onInitOrRefresh({ callbackURL: "/auth/invitation?intent=invite-b" });
    store.onChange("callbackURL", "/unsaved");
    store.resetForm();
    await store.continueWithProvider("google");

    expect(authActions.continueWithGoogleAction).toHaveBeenLastCalledWith(
      "/auth/invitation?intent=invite-b",
      "/auth/signin?intent=invite-b",
    );
    expect(store.form.email).toBe("invited@example.com");

    store.onInitOrRefresh({ callbackURL: undefined });
    await store.continueWithProvider("google");
    expect(authActions.continueWithGoogleAction).toHaveBeenLastCalledWith(undefined, "/auth/signin");
    expect(store.savedState.callbackURL).toBeUndefined();
  });

  it("hard-navigates to the validated callback after the session cookie is committed", async () => {
    authActions.signInWithEmailAction.mockResolvedValue({
      ok: true,
      data: { url: "/en/onboarding/wizard" },
    });
    const store = new SignInStore(rootStore);
    store.onChange("email", "synthetic@example.com");
    store.onChange("password", "local-demo-password");
    store.onInitOrRefresh({ callbackURL: "/en/onboarding/wizard" });

    await store.onSubmit();

    expect(authActions.signInWithEmailAction).toHaveBeenCalledWith({
      email: "synthetic@example.com",
      password: "local-demo-password",
      rememberMe: true,
      callbackURL: "/en/onboarding/wizard",
    });
    expect(assign).toHaveBeenCalledWith("/en/onboarding/wizard");
    expect(store.isLoading).toBe(true);

    await store.onSubmit();
    expect(authActions.signInWithEmailAction).toHaveBeenCalledTimes(1);
  });

  it("does not navigate when authentication returns a validation error", async () => {
    authActions.signInWithEmailAction.mockResolvedValue({
      ok: false,
      error: { errors: ["Invalid credentials"] },
    });
    const store = new SignInStore(rootStore);

    await store.onSubmit();

    expect(assign).not.toHaveBeenCalled();
    expect(store.error).toEqual({ errors: ["Invalid credentials"] });
    expect(store.isLoading).toBe(false);
  });

  it("keeps both social providers locked after hard navigation starts", async () => {
    authActions.continueWithGoogleAction.mockResolvedValue({
      ok: true,
      data: { url: "https://accounts.google.test/authorize" },
    });
    const store = new SignInStore(rootStore);
    store.onInitOrRefresh({ callbackURL: "/en/dashboard" });

    await store.continueWithProvider("google");
    await store.continueWithProvider("google");

    expect(authActions.continueWithGoogleAction).toHaveBeenCalledExactlyOnceWith("/en/dashboard", "/auth/signin");
    expect(assign).toHaveBeenCalledExactlyOnceWith("https://accounts.google.test/authorize");
    expect(store.isLoading).toBe(true);
  });

  it("preserves the onboarding intent in a provider error callback", async () => {
    authActions.continueWithGoogleAction.mockResolvedValue({
      ok: true,
      data: { url: "https://accounts.google.test/authorize" },
    });
    const store = new SignInStore(rootStore);
    store.onInitOrRefresh({ callbackURL: "/auth/invitation?intent=signed.intent" });

    await store.continueWithProvider("google");

    expect(authActions.continueWithGoogleAction).toHaveBeenCalledWith(
      "/auth/invitation?intent=signed.intent",
      "/auth/signin?intent=signed.intent",
    );
  });

  it("releases the social-provider lock when the action fails before navigation", async () => {
    const error = new TypeError("Load failed");
    authActions.continueWithMicrosoftAction.mockRejectedValue(error);
    const store = new SignInStore(rootStore);

    await expect(store.continueWithProvider("microsoft")).rejects.toBe(error);

    expect(store.isLoading).toBe(false);
    expect(assign).not.toHaveBeenCalled();
  });

  it("shows a social validation error and releases the lock", async () => {
    const error = { errors: ["Social sign-in unavailable"] };
    authActions.continueWithGoogleAction.mockResolvedValue({ ok: false, error });
    const store = new SignInStore(rootStore);

    await store.continueWithProvider("google");

    expect(toastZodErrorTree).toHaveBeenCalledExactlyOnceWith(error);
    expect(store.isLoading).toBe(false);
  });
});
