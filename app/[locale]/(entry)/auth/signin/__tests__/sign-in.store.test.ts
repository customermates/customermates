import type { RootStore } from "@/core/stores/root.store";

import { beforeEach, describe, expect, it, vi } from "vitest";
import { redirect } from "next/navigation";

const authActions = vi.hoisted(() => ({
  signInWithEmailAction: vi.fn(),
  continueWithGoogleAction: vi.fn(),
  continueWithMicrosoftAction: vi.fn(),
  requestMagicLinkAction: vi.fn(),
}));

vi.mock("@/app/[locale]/(public)/auth/actions", () => authActions);
const entryActions = vi.hoisted(() => ({ resolveSignInEntryAction: vi.fn() }));
vi.mock("../actions", () => entryActions);
const toastZodErrorTree = vi.hoisted(() => vi.fn());
vi.mock("@/core/utils/toast-zod-error-tree", () => ({ toastZodErrorTree }));
const reportApplicationError = vi.hoisted(() => vi.fn());
vi.mock("@/core/errors/report-application-error", () => ({ reportApplicationError }));

import { SignInStore } from "../sign-in.store";

const assign = vi.fn();
const rootStore = {} as RootStore;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("window", { location: { assign } });
});

describe("SignInStore", () => {
  it("refreshes and clears callbacks in the form and provider continuation together", async () => {
    authActions.continueWithGoogleAction.mockResolvedValue({ ok: true, data: null });
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

  it("waits for the entry of an invitation link before signing in, and keeps what was typed", async () => {
    let resolveEntry: (entry: { callbackURL: string; inviterName: string }) => void = () => undefined;
    entryActions.resolveSignInEntryAction.mockReturnValue(
      new Promise((resolve) => {
        resolveEntry = resolve;
      }),
    );
    authActions.signInWithEmailAction.mockResolvedValue({ ok: true, data: { url: "/en/auth/invitation" } });
    const store = new SignInStore(rootStore);

    store.resolveEntry("?intent=signed.intent");
    store.onChange("email", "invited@example.com");
    const submitted = store.onSubmit();
    await Promise.resolve();

    expect(entryActions.resolveSignInEntryAction).toHaveBeenCalledWith("?intent=signed.intent");
    expect(store.entrySettled).toBe(false);
    expect(store.isLoading).toBe(true);
    expect(authActions.signInWithEmailAction).not.toHaveBeenCalled();

    resolveEntry({ callbackURL: "/auth/invitation?intent=signed.intent", inviterName: "Invite Admin" });
    await submitted;

    expect(store.entry).toMatchObject({ inviterName: "Invite Admin" });
    expect(store.entrySettled).toBe(true);
    expect(authActions.signInWithEmailAction).toHaveBeenCalledWith(
      expect.objectContaining({ email: "invited@example.com", callbackURL: "/auth/invitation?intent=signed.intent" }),
    );
  });

  it("stays unsettled while the server sends a signed-in visitor on", async () => {
    let signal: unknown;
    try {
      redirect("/en/dashboard");
    } catch (error) {
      signal = error;
    }
    entryActions.resolveSignInEntryAction.mockRejectedValue(signal);
    const store = new SignInStore(rootStore);

    store.resolveEntry("");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(store.entrySettled).toBe(false);
    expect(reportApplicationError).not.toHaveBeenCalled();
  });

  it("opens the plain form and reports the failure when the entry cannot be read", async () => {
    const failure = new Error("offline");
    entryActions.resolveSignInEntryAction.mockRejectedValue(failure);
    authActions.signInWithEmailAction.mockResolvedValue({ ok: true, data: { url: "/en" } });
    const store = new SignInStore(rootStore);

    store.resolveEntry("");
    await store.onSubmit();

    expect(store.entrySettled).toBe(true);
    expect(store.entry).toBeNull();
    expect(reportApplicationError).toHaveBeenCalledWith(failure);
    expect(authActions.signInWithEmailAction).toHaveBeenCalledOnce();
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

  it("keeps both providers locked while Next handles the server redirect", async () => {
    let signal: unknown;
    try {
      redirect("https://accounts.google.test/authorize");
    } catch (error) {
      signal = error;
    }
    authActions.continueWithGoogleAction.mockRejectedValue(signal);
    const store = new SignInStore(rootStore);
    store.onInitOrRefresh({ callbackURL: "/en/dashboard" });

    await store.continueWithProvider("google");
    await store.continueWithProvider("google");

    expect(authActions.continueWithGoogleAction).toHaveBeenCalledExactlyOnceWith("/en/dashboard", "/auth/signin");
    expect(assign).not.toHaveBeenCalled();
    expect(store.isLoading).toBe(true);
  });

  it("preserves the onboarding intent in a provider error callback", async () => {
    authActions.continueWithGoogleAction.mockResolvedValue({
      ok: true,
      data: null,
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

  it("sends a sign-in link from the magic link tab with the invitation callback and shows the inbox state", async () => {
    authActions.requestMagicLinkAction.mockResolvedValue({ ok: true, data: { email: "invited@example.com" } });
    const store = new SignInStore(rootStore);
    store.onInitOrRefresh({ callbackURL: "/auth/invitation?intent=signed.intent" });
    store.onChange("email", "Invited@Example.com");
    store.methods.setMethod("magicLink");

    await store.onSubmit();

    expect(authActions.requestMagicLinkAction).toHaveBeenCalledExactlyOnceWith({
      email: "Invited@Example.com",
      callbackURL: "/auth/invitation?intent=signed.intent",
    });
    expect(authActions.signInWithEmailAction).not.toHaveBeenCalled();
    expect(store.methods.magicLinkSentTo).toBe("invited@example.com");
    expect(store.isLoading).toBe(false);
  });

  it("keeps the email form open when a sign-in link is refused", async () => {
    const error = { errors: [], properties: { email: { errors: ["Temporary email addresses can't start a trial."] } } };
    authActions.requestMagicLinkAction.mockResolvedValue({ ok: false, error });
    const store = new SignInStore(rootStore);
    store.onChange("email", "someone@mailinator.com");

    await store.requestMagicLink();

    expect(store.error).toEqual(error);
    expect(store.methods.magicLinkSentTo).toBeNull();
    expect(store.isLoading).toBe(false);
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
