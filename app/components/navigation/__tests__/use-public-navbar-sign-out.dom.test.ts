import type { Root } from "react-dom/client";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ signOut: vi.fn(), toast: vi.fn() }));

vi.mock("@/app/[locale]/actions", () => ({
  signOutAction: mocks.signOut,
  signOutWithOnboardingIntentAction: vi.fn(),
}));
vi.mock("@/core/utils/toast-zod-error-tree", () => ({ toastZodErrorTree: mocks.toast }));

import { usePublicNavbarSignOut } from "../use-public-navbar-sign-out";

import { SESSION_HINT_COOKIE_NAME, SESSION_HINT_DOCUMENT_ATTRIBUTE } from "@/features/auth/session-hint";

let root: Root;
let latest: ReturnType<typeof usePublicNavbarSignOut> | null = null;

function Probe({ onSignedOut }: { onSignedOut?: () => void }) {
  latest = usePublicNavbarSignOut(undefined, onSignedOut);
  return null;
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  document.cookie = `${SESSION_HINT_COOKIE_NAME}=1; Path=/`;
  document.documentElement.setAttribute(SESSION_HINT_DOCUMENT_ATTRIBUTE, "");
  root = createRoot(document.createElement("div"));
});

afterEach(() => {
  act(() => root.unmount());
  latest = null;
});

describe("usePublicNavbarSignOut", () => {
  it("forgets the session hint once signing out succeeded, also without a sign-out callback", async () => {
    mocks.signOut.mockResolvedValue({ ok: true });
    act(() => root.render(createElement(Probe)));

    await act(() => latest?.signOut());

    expect(document.cookie).not.toContain(`${SESSION_HINT_COOKIE_NAME}=`);
    expect(document.documentElement.hasAttribute(SESSION_HINT_DOCUMENT_ATTRIBUTE)).toBe(false);
  });

  it("keeps the session hint when signing out was refused", async () => {
    mocks.signOut.mockResolvedValue({ ok: false, error: { issues: [] } });
    const onSignedOut = vi.fn();
    act(() => root.render(createElement(Probe, { onSignedOut })));

    await act(() => latest?.signOut());

    expect(document.cookie).toContain(`${SESSION_HINT_COOKIE_NAME}=1`);
    expect(onSignedOut).not.toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledOnce();
  });
});
