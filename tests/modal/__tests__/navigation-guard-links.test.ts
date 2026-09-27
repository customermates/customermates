// @vitest-environment jsdom

import type { BaseFormStore } from "@/core/base/base-form.store";
import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";
import type { Root } from "react-dom/client";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NavigationGuardController } from "@/core/stores/navigation-guard.controller";

const guardState = vi.hoisted(() => ({ navigationGuard: null as unknown }));
const router = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next-intl", () => ({ useLocale: () => "en", useTranslations: () => (key: string) => key }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/hooks/use-media-query", () => ({ useIsWiderThan: () => true }));
vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => ({
    agentChatStore: { enabled: true, isOpen: true },
    agentUiControlStore: { active: null },
    navigationGuard: guardState.navigationGuard,
  }),
}));
vi.mock("@/i18n/navigation", () => ({
  IntlLink: ({ children, href, ...props }: { children: ReactNode; href: string }) =>
    createElement(
      "a",
      {
        ...props,
        href: `/en${href}`,
        onClick: (event: ReactMouseEvent) => event.preventDefault(),
      },
      children,
    ),
  usePathname: () => "/company/settings",
  useRouter: () => router,
}));

import { MessageResponse } from "@/components/ai-elements/message";
import { useNavigationGuard } from "@/components/modal/use-navigation-guard";

const dirtyForm = {
  hasUnsavedChanges: true,
  isLoading: false,
  withUnsavedChangesGuard: true,
} as unknown as BaseFormStore;

let navigationGuard: NavigationGuardController;
let container: HTMLDivElement;
let reactRoot: Root;

function GuardedPage({ children, markdown }: { children?: ReactNode; markdown: string }) {
  useNavigationGuard(dirtyForm);
  return createElement("div", null, createElement(MessageResponse, { mode: "static" }, markdown), children);
}

function render(markdown: string, children?: ReactNode) {
  act(() => {
    reactRoot.render(createElement(GuardedPage, { markdown }, children));
  });
}

function link(name: string) {
  const found = [...container.querySelectorAll("a")].find((anchor) => anchor.textContent === name);
  if (!found) throw new Error(`Missing link ${name}`);
  return found;
}

function clickReachesBrowser(anchor: HTMLAnchorElement) {
  let reachedBrowser = false;
  const keepJsdomFromNavigating = (event: Event) => {
    reachedBrowser = !event.defaultPrevented;
    event.preventDefault();
  };
  window.addEventListener("click", keepJsdomFromNavigating);
  act(() => {
    anchor.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
  });
  window.removeEventListener("click", keepJsdomFromNavigating);
  return reachedBrowser;
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  navigationGuard = new NavigationGuardController();
  guardState.navigationGuard = navigationGuard;
  router.push.mockReset();
  container = document.createElement("div");
  document.body.append(container);
  reactRoot = createRoot(container);
});

afterEach(() => {
  act(() => reactRoot.unmount());
  container.remove();
});

describe("useNavigationGuard with links from Mate", () => {
  it("leaves email, phone and other cross-origin links to the browser while a form has unsaved changes", () => {
    render(
      "[Mail us](mailto:support@example.com) or [Call](tel:+491234).",
      createElement("a", { href: "https://example.com/guide" }, "Guide"),
    );

    expect(navigationGuard.isGuarding).toBe(true);

    for (const name of ["Mail us", "Call", "Guide"]) {
      expect(clickReachesBrowser(link(name))).toBe(true);
      expect(navigationGuard.isPending).toBe(false);
    }

    expect(router.push).not.toHaveBeenCalled();
  });

  it("still holds in-app links, relative or same-origin absolute, until the unsaved changes are resolved", async () => {
    render(
      "Open [Deals](/deals).",
      createElement("a", { href: `${window.location.origin}/de/company/settings?tab=roles#owners` }, "Roles"),
    );

    expect(clickReachesBrowser(link("Deals"))).toBe(false);
    expect(navigationGuard.isPending).toBe(true);
    expect(router.push).not.toHaveBeenCalled();

    await act(async () => {
      navigationGuard.confirm();
      await Promise.resolve();
    });
    expect(router.push).toHaveBeenLastCalledWith("/deals");

    expect(clickReachesBrowser(link("Roles"))).toBe(false);
    expect(navigationGuard.isPending).toBe(true);

    await act(async () => {
      navigationGuard.confirm();
      await Promise.resolve();
    });
    expect(router.push).toHaveBeenLastCalledWith("/company/settings?tab=roles#owners");
  });
});
