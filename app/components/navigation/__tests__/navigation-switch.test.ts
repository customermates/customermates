import { act, type ReactNode } from "react";
import { jsx } from "react/jsx-runtime";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  appMode: "cloud" as "cloud" | "demo",
  refresh: vi.fn(),
  closeAllModals: vi.fn(),
  setCompany: vi.fn(),
  setOverrides: vi.fn(),
  setSubscription: vi.fn(),
  setUser: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => ({ getAll: () => [] }),
}));
vi.mock("@/i18n/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({ refresh: state.refresh }),
}));
vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => ({
    appMode: state.appMode,
    closeAllModals: state.closeAllModals,
    companyStore: { setCompany: state.setCompany },
    subscriptionStore: { setSubscription: state.setSubscription },
    terminologyStore: { setOverrides: state.setOverrides },
    userStore: { setUser: state.setUser },
  }),
}));

vi.mock("@/app/components/app-sidebar", () => ({ AppSidebar: () => null }));
vi.mock("@/app/components/app-topbar", () => ({ AppTopBar: () => jsx("div", { "data-app-topbar": true }) }));
vi.mock("@/app/components/public-navbar", () => ({ PublicNavbar: () => null }));
vi.mock("@/app/components/shell-header", () => ({ ShellHeader: () => null }));
vi.mock("@/app/[locale]/(static)/docs/components/docs-sidebar", () => ({
  DocsSidebar: () => null,
}));
vi.mock("@/app/[locale]/(static)/docs/components/docs-topbar", () => ({
  DocsTopBar: () => null,
}));
vi.mock("@/app/components/topbar-actions-context", () => ({
  TopBarActionsProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/components/ui/sidebar", () => ({
  SidebarInset: ({ children }: { children: ReactNode }) => children,
  SidebarProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/components/shared/app-locale-preference-sync", () => ({
  AppLocalePreferenceSync: () => jsx("span", { "data-locale-preference-sync": true }),
}));
vi.mock("../protected-enhancements-context", () => ({
  ProtectedEnhancementsProvider: ({ children }: { children: ReactNode }) => children,
}));

import { NavigationSwitch } from "../navigation-switch";

type NavigationSwitchProps = Parameters<typeof NavigationSwitch>[0];

function allowedProps(): Omit<NavigationSwitchProps, "children"> {
  return {
    accountState: "allowed",
    appUser: null,
    channelsNeedingActionCount: 0,
    company: null,
    emailVerified: true,
    legalStatus: null,
    sidebarUser: {
      avatarUrl: null,
      email: "test@example.com",
      firstName: "Test",
      lastName: "User",
      role: { isSystemRole: true, permissions: [] },
    },
    subscription: null,
    systemTaskCount: 0,
    terminology: [],
    trialDaysLeft: null,
    unreadThreadCount: 0,
    userDisplayLanguage: "en",
  };
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.clearAllMocks();
  state.appMode = "cloud";
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe("NavigationSwitch account-state refresh", () => {
  it.each([
    ["cloud", true],
    ["demo", false],
  ] as const)("renders stored locale reconciliation in %s mode: %s", (appMode, expected) => {
    state.appMode = appMode;

    act(() => {
      root.render(jsx(NavigationSwitch, { ...allowedProps(), children: "page" }));
    });

    expect(container.querySelector("[data-locale-preference-sync]") !== null).toBe(expected);
  });

  it("refreshes when a background tab becomes visible and removes its listener on unmount", () => {
    const visibility = vi.spyOn(document, "visibilityState", "get");
    const props = allowedProps();

    act(() => {
      root.render(jsx(NavigationSwitch, { ...props, children: "page" }));
    });

    visibility.mockReturnValue("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(state.refresh).not.toHaveBeenCalled();

    visibility.mockReturnValue("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(state.refresh).toHaveBeenCalledOnce();

    act(() => root.render(jsx("div", {})));
    document.dispatchEvent(new Event("visibilitychange"));
    expect(state.refresh).toHaveBeenCalledOnce();
  });

  it("keeps the top bar and page content in the same vertical scrollport", () => {
    act(() => {
      root.render(
        jsx(NavigationSwitch, {
          ...allowedProps(),
          children: jsx("div", { "data-page-content": true }),
        }),
      );
    });

    const topbar = container.querySelector<HTMLElement>("[data-app-topbar]");
    const page = container.querySelector<HTMLElement>("[data-page-content]");
    const scrollport = topbar?.parentElement;

    expect(scrollport).toBe(page?.parentElement?.parentElement);
    expect(scrollport?.className).toContain("overflow-y-auto");
    expect(scrollport?.className).toContain("[--table-sticky-top:4rem]");
  });
});
