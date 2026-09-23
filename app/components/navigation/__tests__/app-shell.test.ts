import type { ReactElement } from "react";

import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  accountState: "unauthenticated" as "unauthenticated" | "unregistered" | "allowed",
  messages: { SignInForm: { signInTitle: "Sign in" }, Common: { actions: { save: "Save" } } },
}));

vi.mock("next/headers", () => ({ cookies: () => Promise.resolve({ get: () => undefined }) }));
vi.mock("next-intl/server", () => ({ getMessages: () => Promise.resolve(state.messages) }));
vi.mock("@/features/auth/next/resolve-account-state", () => ({
  resolveRequestAccountState: () => Promise.resolve({ state: state.accountState, user: null }),
}));
vi.mock("@/core/di", () => ({
  getGetOperatorConsoleVisibilityInteractor: () => ({ invoke: () => Promise.resolve(false) }),
  getGetCompanySettingsInteractor: vi.fn(),
  getCountSystemTasksInteractor: vi.fn(),
  getGetSubscriptionInteractor: vi.fn(),
  getGetUnreadThreadCountInteractor: vi.fn(),
  getCountChannelsNeedingActionInteractor: vi.fn(),
}));
vi.mock("../navigation-data", () => ({
  loadNavigationData: () =>
    Promise.resolve({
      company: null,
      terminology: [],
      subscription: null,
      trialDaysLeft: null,
      systemTaskCount: 0,
      unreadThreadCount: 0,
      channelsNeedingActionCount: 0,
    }),
}));
vi.mock("@/ee/agent-chat/agent-availability", () => ({ isAgentChatAvailable: () => false }));
vi.mock("@/env", () => ({ env: { APP_MODE: "cloud" } }));
vi.mock("@/core/stores/root-store.provider", () => ({ RootStoreProvider: () => null }));
vi.mock("../navigation-switch", () => ({ NavigationSwitch: () => null }));
vi.mock("../sidebar-user", () => ({ toSidebarUser: () => null }));

import { AppShell } from "../app-shell";

async function renderShell() {
  return (await AppShell({ children: "page", displayLanguage: "en" })) as ReactElement<{
    locale?: string;
    messages?: unknown;
    timeZone?: string;
  }>;
}

describe("AppShell message scope", () => {
  beforeEach(() => {
    state.accountState = "unauthenticated";
  });

  it("gives anonymous visitors the full catalogue that the root layout narrows to marketing namespaces", async () => {
    const shell = await renderShell();

    expect(shell.type).toBe(NextIntlClientProvider);
    expect(shell.props).toMatchObject({ locale: "en", messages: state.messages, timeZone: "UTC" });
  });

  it.each(["unregistered", "allowed"] as const)(
    "adds no second provider for a %s account, which already receives the full catalogue",
    async (accountState) => {
      state.accountState = accountState;
      const shell = await renderShell();

      expect(shell.type).not.toBe(NextIntlClientProvider);
    },
  );
});
