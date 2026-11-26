import type { Root } from "react-dom/client";

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) =>
    values ? `${key} ${JSON.stringify(values)}` : key,
}));
vi.mock("@/components/shared/app-image", () => ({ AppImage: () => null }));
vi.mock("@/components/forms/form-input", () => ({
  FormInput: ({ id }: { id: string }) => <input data-field={id} />,
}));

import { AUTH_METHOD_STORAGE_KEY, AuthMethodState } from "../auth-method-state";
import { AuthMethodActions, AuthMethodTabs } from "../auth-method-tabs";

const bothProviders = { google: true, microsoft: true };
const noProviders = { google: false, microsoft: false };

let container: HTMLDivElement;
let root: Root;

function render(state: AuthMethodState, socialProviders = bothProviders) {
  const onContinueWithProvider = vi.fn().mockResolvedValue(undefined);
  const onResendMagicLink = vi.fn().mockResolvedValue(undefined);
  act(() =>
    root.render(
      <>
        <AuthMethodTabs
          isLoading={false}
          password={<p>Password fields</p>}
          providerLabel={(provider) => `Continue with ${provider}`}
          socialProviders={socialProviders}
          state={state}
          onContinueWithProvider={onContinueWithProvider}
        />

        <AuthMethodActions
          isLoading={false}
          magicLinkCta="Email me a sign-in link"
          passwordCta="Sign In"
          socialProviders={socialProviders}
          state={state}
          onResendMagicLink={onResendMagicLink}
        />
      </>,
    ),
  );
  return { onContinueWithProvider, onResendMagicLink };
}

function tabs() {
  return [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
}

function select(tab: HTMLButtonElement | undefined) {
  act(() => {
    tab?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
  });
}

function buttons() {
  return [...container.querySelectorAll<HTMLButtonElement>("button:not([role='tab'])")].map(
    (button) => button.textContent,
  );
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.localStorage.clear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("sign-in method tabs", () => {
  it("opens on the password tab and switches between the three methods", () => {
    const state = new AuthMethodState();
    render(state);

    expect(tabs().map((tab) => tab.textContent)).toEqual([
      "AuthMethods.tabs.password",
      "AuthMethods.tabs.sso",
      "AuthMethods.tabs.magicLink",
    ]);
    expect(container.textContent).toContain("Password fields");
    expect(buttons()).toEqual(["Sign In"]);

    select(tabs()[1]);
    expect(state.method).toBe("sso");
    expect(buttons()).toEqual(["Continue with Google", "Continue with Microsoft"]);

    select(tabs()[2]);
    expect(state.method).toBe("magicLink");
    expect(container.querySelector('[data-field="email"]')).not.toBeNull();
    expect(buttons()).toEqual(["Email me a sign-in link"]);
  });

  it("remembers the last tab in this browser", () => {
    const first = new AuthMethodState();
    render(first);
    select(tabs()[2]);
    expect(window.localStorage.getItem(AUTH_METHOD_STORAGE_KEY)).toBe("magicLink");

    act(() => root.unmount());
    root = createRoot(container);
    const next = new AuthMethodState();
    render(next);

    expect(next.method).toBe("magicLink");
    expect(tabs()[2]?.dataset.state).toBe("active");
  });

  it("hides single sign-on when no provider is configured and ignores a remembered single sign-on tab", () => {
    window.localStorage.setItem(AUTH_METHOD_STORAGE_KEY, "sso");
    const state = new AuthMethodState();
    render(state, noProviders);

    expect(tabs().map((tab) => tab.textContent)).toEqual(["AuthMethods.tabs.password", "AuthMethods.tabs.magicLink"]);
    expect(state.method).toBe("password");
    expect(container.textContent).toContain("Password fields");
  });

  it("opens with the plain form when browser storage is blocked", () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const state = new AuthMethodState();
    render(state);
    select(tabs()[2]);

    expect(state.method).toBe("magicLink");
    getItem.mockRestore();
    setItem.mockRestore();
  });

  it("shows the inbox state with a resend countdown and lets the visitor use another email", () => {
    const now = 1_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const state = new AuthMethodState(() => now);
    state.setMethod("magicLink");
    state.markMagicLinkSent("visitor@example.com");
    render(state);

    expect(container.textContent).toContain("AuthMethods.magicLink.sentTitle");
    expect(container.textContent).toContain('AuthMethods.magicLink.sentBody {"email":"visitor@example.com"}');
    const [resend, another] = [...container.querySelectorAll<HTMLButtonElement>("button:not([role='tab'])")];
    expect(resend?.textContent).toBe('AuthMethods.magicLink.resendIn {"seconds":60}');
    expect(resend?.disabled).toBe(true);

    act(() => another?.click());

    expect(state.magicLinkSentTo).toBeNull();
    expect(container.querySelector('[data-field="email"]')).not.toBeNull();
    vi.restoreAllMocks();
  });
});
