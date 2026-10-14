import type { ComponentProps } from "react";
import type { RootStore } from "@/core/stores/root.store";
import type { TenantUser } from "@/features/user/user.schema";
import type { NavUser } from "../navigation/nav-user";
import type { SidebarUser } from "../navigation/sidebar-user";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { createMockUser } from "@/tests/helpers/mock-user";

type NavUserProps = ComponentProps<typeof NavUser>;

const harness = vi.hoisted(() => ({
  rootStore: null as unknown,
  navUser: vi.fn<(props: NavUserProps) => void>(),
  updateUserAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/en/settings/profile",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/i18n/navigation", () => ({
  usePathname: () => "/settings/profile",
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/core/stores/root-store.provider", () => ({ useRootStore: () => harness.rootStore }));
vi.mock("@/app/[locale]/(protected)/dashboard/actions", () => ({ updatePreferencesAction: vi.fn() }));
vi.mock("@/app/[locale]/(protected)/settings/(account)/actions", () => ({
  updateUserAction: harness.updateUserAction,
  resendVerificationEmailFromAppAction: vi.fn(),
}));
vi.mock("@/components/ui/sidebar", () => ({
  Sidebar: ({ children }: { children: unknown }) => children,
  SidebarContent: ({ children }: { children: unknown }) => children,
  SidebarFooter: ({ children }: { children: unknown }) => children,
  useSidebar: () => ({ isMobile: false, setOpenMobile: vi.fn() }),
}));
vi.mock("@/components/modal", () => ({ AppModal: () => null }));
vi.mock("../navigation/nav-header", () => ({ NavHeader: () => null }));
vi.mock("../navigation/area-nav", () => ({ AreaNav: () => null }));
vi.mock("../navigation/nav-sections", () => ({ NavSections: () => null, useResolvedSidebar: () => null }));
vi.mock("../navigation/nav-secondary", () => ({ NavSecondary: () => null }));
vi.mock("../navigation/sidebar-customize", () => ({ SidebarCustomize: () => null }));
vi.mock("../navigation/legal-update-alert", () => ({ LegalUpdateAlert: () => null }));
vi.mock("../navigation/use-account-actions", () => ({
  useAccountActions: () => ({
    theme: "system",
    changeTheme: vi.fn(),
    signOut: vi.fn(),
    inviteMembers: vi.fn(),
    sendFeedback: vi.fn(),
  }),
}));
vi.mock("../navigation/nav-user", () => ({
  NavUser: (props: NavUserProps) => {
    harness.navUser(props);
    return null;
  },
}));

const { AppSidebar } = await import("../app-sidebar");
const { UserStore } = await import("@/app/[locale]/(protected)/settings/(account)/components/user.store");
const { ProfileSettingsStore } = await import(
  "@/app/[locale]/(protected)/settings/(account)/components/profile-settings.store"
);

const signedIn = createMockUser({
  id: "00000000-0000-4000-8000-000000000001",
  companyId: "00000000-0000-4000-8000-000000000002",
  firstName: "Ada",
  lastName: "Lovelace",
  email: "ada@example.test",
});

const serverRenderedUser: SidebarUser = {
  firstName: "Ada",
  lastName: "Lovelace",
  email: "ada@example.test",
  avatarUrl: null,
  role: { isSystemRole: true, permissions: [] },
};

function rootStoreWith(user: TenantUser | null) {
  const root = {
    appMode: "self-hosted",
    agentChatEnabled: false,
    agentChatStore: { enabled: false, isWorking: false, routeSyncStatus: "idle", toggle: vi.fn() },
    addPickerStore: {
      isOpen: false,
      focusReturnFallback: null,
      focusReturnTarget: null,
      close: vi.fn(),
      openFrom: vi.fn(),
    },
    globalSearchModalStore: { openFrom: vi.fn() },
    keyboardShortcutsStore: { openFrom: vi.fn(), setDestinations: vi.fn() },
    messagingThreadsStore: { unreadThreadCount: null, refreshUnreadCount: vi.fn() },
    recordWorkspaceStore: {
      navigation: null,
      navigationRefreshFailed: false,
      open: vi.fn(),
      refreshNavigation: vi.fn(),
      routeReady: () => true,
    },
  } as unknown as RootStore;
  Object.assign(root, { userStore: new UserStore(root), profileSettingsStore: new ProfileSettingsStore(root) });
  root.userStore.setUser(user);
  harness.rootStore = root;
  return root;
}

function personalMenuUser(props: ComponentProps<typeof AppSidebar>) {
  harness.navUser.mockClear();
  renderToStaticMarkup(createElement(AppSidebar, props));
  return harness.navUser.mock.lastCall?.[0].user;
}

describe("sidebar personal menu", () => {
  it("shows the name saved on Profile & preferences while the server-rendered sidebar user is still the old one", async () => {
    const root = rootStoreWith(signedIn);
    harness.updateUserAction.mockResolvedValue({
      ok: true,
      data: {
        firstName: "Augusta",
        lastName: "King",
        country: signedIn.country,
        avatarUrl: "https://example.test/augusta.png",
        theme: signedIn.theme,
        displayLanguage: "en",
        formattingLocale: "en",
      },
    });
    root.profileSettingsStore.onChange("firstName", "Augusta");
    root.profileSettingsStore.onChange("lastName", "King");

    await root.profileSettingsStore.onSubmit();

    expect(
      personalMenuUser({
        mode: "full",
        user: serverRenderedUser,
        subscription: null,
        trialDaysLeft: null,
        emailVerified: true,
        legalStatus: null,
        operatorConsoleVisible: false,
        systemTaskCount: 0,
        unreadThreadCount: 0,
        channelsNeedingActionCount: 0,
      }),
    ).toMatchObject({
      firstName: "Augusta",
      lastName: "King",
      email: "ada@example.test",
      avatarUrl: "https://example.test/augusta.png",
    });
  });

  it("shows the server-rendered user in the restricted shell, which keeps no user in the store", () => {
    rootStoreWith(null);

    expect(personalMenuUser({ mode: "restricted", user: serverRenderedUser })).toMatchObject({
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.test",
    });
  });
});
