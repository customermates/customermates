import { act, type ReactNode } from "react";
import { jsx } from "react/jsx-runtime";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
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
    closeAllModals: state.closeAllModals,
    companyStore: { setCompany: state.setCompany },
    subscriptionStore: { setSubscription: state.setSubscription },
    terminologyStore: { setOverrides: state.setOverrides },
    userStore: { setUser: state.setUser },
  }),
}));

vi.mock("@/app/components/app-sidebar", () => ({ AppSidebar: () => null }));
vi.mock("@/app/components/app-topbar", () => ({ AppTopBar: () => null }));
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
  AppLocalePreferenceSync: () => null,
}));
vi.mock("../protected-enhancements-context", () => ({
  ProtectedEnhancementsProvider: ({ children }: { children: ReactNode }) => children,
}));

import { NavigationSwitch } from "../navigation-switch";

type NavigationSwitchProps = Parameters<typeof NavigationSwitch>[0];

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.clearAllMocks();
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
  it("refreshes when a background tab becomes visible and removes its listener on unmount", () => {
    const visibility = vi.spyOn(document, "visibilityState", "get");
    const props: Omit<NavigationSwitchProps, "children"> = {
      accountState: "allowed",
      appUser: null,
      channelsNeedingActionCount: 0,
      company: null,
      emailVerified: true,
      legalStatus: null,
      sidebarUser: null,
      subscription: null,
      systemTaskCount: 0,
      terminology: [],
      trialDaysLeft: null,
      unreadThreadCount: 0,
      userDisplayLanguage: "en",
    };

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
});
