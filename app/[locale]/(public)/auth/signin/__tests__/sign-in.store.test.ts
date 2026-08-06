import type { RootStore } from "@/core/stores/root.store";

import { beforeEach, describe, expect, it, vi } from "vitest";

const authActions = vi.hoisted(() => ({
  signInWithEmailAction: vi.fn(),
}));

vi.mock("@/app/[locale]/(public)/auth/actions", () => authActions);

import { SignInStore } from "../sign-in.store";

const assign = vi.fn();
const rootStore = {} as RootStore;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("window", { location: { assign } });
});

describe("SignInStore", () => {
  it("hard-navigates to the validated callback after the session cookie is committed", async () => {
    authActions.signInWithEmailAction.mockResolvedValue({
      ok: true,
      data: { url: "/en/onboarding/wizard" },
    });
    const store = new SignInStore(rootStore);
    store.onChange("email", "synthetic@example.com");
    store.onChange("password", "local-demo-password");
    store.setCallbackURL("/en/onboarding/wizard");

    await store.onSubmit();

    expect(authActions.signInWithEmailAction).toHaveBeenCalledWith({
      email: "synthetic@example.com",
      password: "local-demo-password",
      rememberMe: true,
      callbackURL: "/en/onboarding/wizard",
    });
    expect(assign).toHaveBeenCalledWith("/en/onboarding/wizard");
    expect(store.isLoading).toBe(false);
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
  });
});
