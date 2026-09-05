import type { Context, ReactNode } from "react";
import type { Root } from "react-dom/client";
import type { RootStore } from "@/core/stores/root.store";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  rootStore: undefined as RootStore | undefined,
  searchContext: undefined as Context<string> | undefined,
  token: "reset-a",
  resetPasswordAction: vi.fn(),
}));

vi.mock("../../actions", () => ({ resetPasswordAction: harness.resetPasswordAction }));
vi.mock("next/navigation", async () => {
  const { createContext, useContext } = await import("react");
  const searchContext = createContext("");
  harness.searchContext = searchContext;
  return { useSearchParams: () => new URLSearchParams({ token: useContext(searchContext) }) };
});
vi.mock("next-intl", () => ({
  useTranslations: () =>
    Object.assign((key: string) => key, {
      rich: (key: string, values: { backToSignInLink: (children: ReactNode) => ReactNode }) =>
        values.backToSignInLink(key),
    }),
}));
vi.mock("@/core/stores/root-store.provider", () => ({ useRootStore: () => harness.rootStore }));
vi.mock("@/components/modal/use-navigation-guard", () => ({ useNavigationGuard: vi.fn() }));
vi.mock("@/components/shared/app-image", () => ({ AppImage: () => null }));
vi.mock("@/components/shared/app-link", () => ({
  AppLink: ({ href, children }: { href: string; children?: ReactNode }) => createElement("a", { href }, children),
}));

import { ResetPasswordForm } from "../reset-password-form";
import { ResetPasswordStore } from "../reset-password.store";

let container: HTMLDivElement;
let root: Root;
let store: ResetPasswordStore;

function render(onboardingIntent?: string) {
  const searchContext = harness.searchContext;
  if (!searchContext) throw new Error("Router context did not initialize");
  act(() =>
    root.render(
      createElement(
        searchContext.Provider,
        { value: harness.token },
        createElement(ResetPasswordForm, { onboardingIntent }),
      ),
    ),
  );
}

function setPasswords(password: string) {
  act(() => {
    store.onChange("password", password);
    store.onChange("confirmPassword", password);
  });
}

function expectPasswords(password: string) {
  expect(container.querySelector<HTMLInputElement>("#password")?.value).toBe(password);
  expect(container.querySelector<HTMLInputElement>("#confirmPassword")?.value).toBe(password);
  expect(store.form.password).toBe(password);
  expect(store.form.confirmPassword).toBe(password);
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  harness.token = "reset-a";
  harness.resetPasswordAction.mockResolvedValue({ ok: true, data: null });
  const rootStore = { terminologyStore: { overrides: [] } } as unknown as RootStore;
  store = new ResetPasswordStore(rootStore);
  Object.assign(rootStore, { resetPasswordStore: store });
  harness.rootStore = rootStore;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  harness.rootStore = undefined;
});

describe("ResetPasswordForm context lifecycle", () => {
  it("initializes the token and intent and clears credentials from a previous mount", () => {
    store.onInitOrRefresh({
      token: "old-reset",
      onboardingIntent: "old-intent",
      password: "OldPass1!",
      confirmPassword: "OldPass1!",
    });
    render("invite-a");
    expectPasswords("");
    expect(store.form).toEqual({
      token: "reset-a",
      onboardingIntent: "invite-a",
      password: "",
      confirmPassword: "",
    });
    expect(store.savedState).toEqual(store.form);
    expect(store.withUnsavedChangesGuard).toBe(false);
  });

  it("preserves credentials while refreshing and clearing only the intent", () => {
    render("invite-a");
    setPasswords("ValidPass1!");
    render("invite-b");
    expectPasswords("ValidPass1!");
    expect(store.form.token).toBe("reset-a");
    expect(store.form.onboardingIntent).toBe("invite-b");
    expect(store.savedState).toEqual(store.form);
    expect(container.querySelector("a")?.getAttribute("href")).toBe("/auth/signin?intent=invite-b");

    render();
    expectPasswords("ValidPass1!");
    expect(store.form.token).toBe("reset-a");
    expect(store.form.onboardingIntent).toBeUndefined();
    expect(store.savedState.onboardingIntent).toBeUndefined();
    expect(container.querySelector("a")?.getAttribute("href")).toBe("/auth/signin");
  });

  it("clears credentials when token and intent change together and submits the new context", async () => {
    render("invite-a");
    setPasswords("FirstPass1!");
    harness.token = "reset-b";
    render("invite-b");
    expectPasswords("");
    expect(store.form).toEqual({
      token: "reset-b",
      onboardingIntent: "invite-b",
      password: "",
      confirmPassword: "",
    });
    expect(store.savedState).toEqual(store.form);

    setPasswords("SecondPass1!");
    const form = container.querySelector("form");
    if (!form) throw new Error("Reset form did not render");
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });
    expect(harness.resetPasswordAction).toHaveBeenCalledExactlyOnceWith({
      token: "reset-b",
      onboardingIntent: "invite-b",
      password: "SecondPass1!",
      confirmPassword: "SecondPass1!",
    });
  });

  it("clears credentials for a token-only change without losing intent", () => {
    render("invite-a");
    setPasswords("ValidPass1!");
    harness.token = "reset-b";
    render("invite-a");
    expectPasswords("");
    expect(store.form.token).toBe("reset-b");
    expect(store.form.onboardingIntent).toBe("invite-a");
    expect(store.savedState).toEqual(store.form);
  });

  it("does not reinitialize credentials on an unrelated rerender", () => {
    render("invite-a");
    setPasswords("ValidPass1!");
    render("invite-a");
    expectPasswords("ValidPass1!");
    expect(store.savedState.password).toBe("");
  });
});
