import { act, type ReactNode } from "react";
import { jsx } from "react/jsx-runtime";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  appMode: "cloud" as "cloud" | "demo",
  pathname: "/dashboard",
  refresh: vi.fn(),
  currentUser: null as { id: string } | null,
  navigationRenderActive: false,
  renderPhaseUserWrites: [] as Array<{ id: string } | null>,
  closeAllModals: vi.fn(),
  setCompany: vi.fn(),
  setOverrides: vi.fn(),
  setSubscription: vi.fn(),
  setUser: vi.fn(),
}));

state.setUser.mockImplementation((user: { id: string } | null) => {
  if (state.navigationRenderActive) state.renderPhaseUserWrites.push(user);
  state.currentUser = user;
});

vi.mock("next/navigation", () => ({
  useSearchParams: () => ({ getAll: () => [] }),
}));
vi.mock("@/i18n/navigation", () => ({
  usePathname: () => state.pathname,
  useRouter: () => ({ refresh: state.refresh }),
}));
vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => ({
    appMode: state.appMode,
    closeAllModals: state.closeAllModals,
    companyStore: { setCompany: state.setCompany },
    subscriptionStore: { setSubscription: state.setSubscription },
    terminologyStore: { setOverrides: state.setOverrides },
    userStore: {
      get user() {
        return state.currentUser;
      },
      setUser: state.setUser,
    },
  }),
}));

vi.mock("@/app/components/app-sidebar", () => ({
  AppSidebar: ({ operatorConsoleVisible }: { operatorConsoleVisible?: boolean }) =>
    jsx("aside", {
      "data-app-sidebar": true,
      "data-operator-console-visible": operatorConsoleVisible,
    }),
}));
vi.mock("@/app/components/app-topbar", () => ({
  AppTopBar: ({ operatorConsoleVisible }: { operatorConsoleVisible: boolean }) =>
    jsx("div", {
      "data-app-topbar": true,
      "data-operator-console-visible": operatorConsoleVisible,
    }),
}));
vi.mock("@/app/components/public-navbar", () => ({
  PublicNavbar: () => jsx("div", { "data-public-navbar": true }),
}));
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

const appUser = {
  id: "00000000-0000-4000-8000-000000000001",
  companyId: "company-1",
  email: "test@example.com",
  firstName: "Test",
  lastName: "User",
  roleId: null,
  status: "active",
  country: "de",
  avatarUrl: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  displayLanguage: "en",
  formattingLocale: "system",
  theme: "system",
  agreeToTerms: true,
  lastActiveAt: null,
  onboardingWizardCompletedAt: new Date("2026-01-01T00:00:00.000Z"),
  role: null,
} satisfies NonNullable<NavigationSwitchProps["appUser"]>;

const replacementAppUser = {
  ...appUser,
  id: "00000000-0000-4000-8000-000000000002",
  companyId: "company-2",
  email: "replacement@example.com",
} satisfies NonNullable<NavigationSwitchProps["appUser"]>;

function NavigationRenderMarker({ active }: { active: boolean }) {
  state.navigationRenderActive = active;
  return null;
}

function renderWithinNavigationMarkers(props: NavigationSwitchProps) {
  root.render([
    jsx(NavigationRenderMarker, { key: "before", active: true }),
    jsx(NavigationSwitch, { key: "switch", ...props }),
    jsx(NavigationRenderMarker, { key: "after", active: false }),
  ]);
}

function allowedProps(): Omit<NavigationSwitchProps, "children"> {
  return {
    accountState: "allowed",
    appUser: null,
    channelsNeedingActionCount: 0,
    company: null,
    emailVerified: true,
    legalStatus: null,
    operatorConsoleVisible: false,
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
  state.pathname = "/dashboard";
  state.currentUser = null;
  state.navigationRenderActive = false;
  state.renderPhaseUserWrites = [];
  state.appMode = "cloud";
  state.pathname = "/dashboard";
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
  it("synchronizes a signed-out account after render without mutating the store during render", () => {
    const allowed = { ...allowedProps(), appUser };
    state.currentUser = appUser;

    act(() => {
      renderWithinNavigationMarkers({ ...allowed, children: "page" });
    });
    state.renderPhaseUserWrites = [];

    act(() => {
      renderWithinNavigationMarkers({
        ...allowed,
        accountState: "unauthenticated",
        appUser: null,
        sidebarUser: null,
        children: "signed out",
      });
    });

    expect(state.renderPhaseUserWrites).toEqual([]);
    expect(state.setUser).toHaveBeenLastCalledWith(null);
    expect(state.currentUser).toBeNull();
  });

  it("synchronizes an account replacement after render without mutating the store during render", () => {
    const allowed = { ...allowedProps(), appUser };
    state.currentUser = appUser;

    act(() => {
      renderWithinNavigationMarkers({ ...allowed, children: "first account" });
    });
    state.renderPhaseUserWrites = [];

    act(() => {
      renderWithinNavigationMarkers({ ...allowed, appUser: replacementAppUser, children: "replacement account" });
    });

    expect(state.renderPhaseUserWrites).toEqual([]);
    expect(state.setUser).toHaveBeenLastCalledWith(replacementAppUser);
    expect(state.currentUser).toBe(replacementAppUser);
  });

  it("uses the normal app shell for an allowed operator route", () => {
    state.pathname = "/operator/users";

    act(() => {
      root.render(
        jsx(NavigationSwitch, {
          ...allowedProps(),
          operatorConsoleVisible: true,
          children: jsx("div", { "data-operator-content": true }),
        }),
      );
    });

    expect(container.querySelector("[data-operator-content]")).not.toBeNull();
    expect(container.querySelector("[data-app-sidebar]")?.getAttribute("data-operator-console-visible")).toBe("true");
    expect(container.querySelector("[data-app-topbar]")?.getAttribute("data-operator-console-visible")).toBe("true");
  });

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

  it("keeps the public header and page in one route-resetting scrollport", () => {
    state.pathname = "/styleguide";

    act(() => {
      root.render(
        jsx(NavigationSwitch, {
          ...allowedProps(),
          children: jsx("div", { "data-page-content": true }),
        }),
      );
    });

    const navbar = container.querySelector<HTMLElement>("[data-public-navbar]");
    const header = navbar?.parentElement;
    const page = container.querySelector<HTMLElement>("[data-page-content]");
    const pageFrame = page?.parentElement;
    const scrollport = container.querySelector<HTMLElement>("[data-public-scrollport]");
    const main = scrollport?.querySelector("main");

    expect(header?.tagName).toBe("HEADER");
    expect(header?.parentElement).toBe(scrollport);
    expect(header?.className).toContain("sticky");
    expect(header?.classList.contains("shrink-0")).toBe(true);
    expect(page?.closest("[data-public-scrollport]")).toBe(scrollport);
    expect(main?.parentElement).toBe(scrollport);
    expect(pageFrame?.parentElement).toBe(main);
    expect(main?.classList.contains("flex")).toBe(true);
    expect(main?.classList.contains("flex-1")).toBe(true);
    expect(main?.classList.contains("flex-col")).toBe(true);
    expect(pageFrame?.classList.contains("flex")).toBe(true);
    expect(pageFrame?.classList.contains("flex-1")).toBe(true);
    expect(scrollport?.classList.contains("flex")).toBe(true);
    expect(scrollport?.classList.contains("flex-col")).toBe(true);
    expect(scrollport?.className).toContain("h-svh");
    expect(scrollport?.className).toContain("overflow-y-auto");
    expect(scrollport?.className).toContain("[--table-sticky-top:4rem]");
    expect(scrollport?.className).toContain("[--toc-sticky-top:4rem]");
    expect(scrollport?.className).toContain("[--toc-anchor-offset:5rem]");

    if (scrollport) scrollport.scrollTop = 480;
    state.pathname = "/styleguide/patterns";
    act(() => {
      root.render(
        jsx(NavigationSwitch, {
          ...allowedProps(),
          children: jsx("div", { "data-page-content": true }),
        }),
      );
    });
    expect(scrollport?.scrollTop).toBe(0);
  });
});
