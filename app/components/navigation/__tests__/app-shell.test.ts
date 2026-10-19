import type { ReactElement } from "react";

import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  accountState: "unauthenticated" as "unauthenticated" | "unregistered" | "allowed",
  messages: { SignInForm: { signInTitle: "Sign in" }, Common: { actions: { save: "Save" } } },
  loaders: null as null | { pendingMemberCount: () => Promise<number> },
  countPendingMembers: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies: () => Promise.resolve({ get: () => undefined }) }));
vi.mock("next-intl/server", () => ({ getMessages: () => Promise.resolve(state.messages) }));
vi.mock("@/features/auth/next/resolve-account-state", () => ({
  resolveRequestAccountState: () => Promise.resolve({ state: state.accountState, user: null }),
}));
vi.mock("@/core/di", () => ({
  getGetOperatorConsoleVisibilityInteractor: () => ({ invoke: () => Promise.resolve(false) }),
  getCountPendingMembersInteractor: () => ({ invoke: state.countPendingMembers }),
  getGetSubscriptionInteractor: vi.fn(),
  getGetUnreadThreadCountInteractor: vi.fn(),
  getCountChannelsNeedingActionInteractor: vi.fn(),
}));
vi.mock("../navigation-data", () => ({
  loadNavigationData: (_state: unknown, loaders: { pendingMemberCount: () => Promise<number> }) => {
    state.loaders = loaders;
    return Promise.resolve({
      subscription: null,
      trialDaysLeft: null,
      pendingMemberCount: 0,
      unreadThreadCount: 0,
      channelsNeedingActionCount: 0,
    });
  },
}));
vi.mock("@/ee/agent-chat/agent-availability", () => ({ isAgentChatAvailable: () => false }));
vi.mock("@/env", () => ({ env: { APP_MODE: "cloud" } }));
vi.mock("@/core/stores/root-store.provider", () => ({ RootStoreProvider: () => null }));
vi.mock("../navigation-switch", () => ({ NavigationSwitch: () => null }));
vi.mock("../sidebar-user", () => ({ toSidebarUser: () => null }));

import { AppShell } from "../app-shell";
import { ForbiddenError } from "@/core/errors/app-errors";

async function renderShell() {
  return (await AppShell({ children: "page", displayLanguage: "en" })) as ReactElement<{
    locale?: string;
    messages?: unknown;
    timeZone?: string;
  }>;
}

describe("AppShell message scope", () => {
  it.each(["unauthenticated", "unregistered", "allowed"] as const)(
    "restores the full catalogue that the root layout narrows to marketing namespaces for a %s account",
    async (accountState) => {
      state.accountState = accountState;
      const shell = await renderShell();

      expect(shell.type).toBe(NextIntlClientProvider);
      expect(shell.props).toMatchObject({ locale: "en", messages: state.messages, timeZone: "UTC" });
    },
  );
});

describe("AppShell pending members badge", () => {
  it("counts the members waiting for approval", async () => {
    state.accountState = "allowed";
    state.countPendingMembers.mockResolvedValueOnce({ ok: true, data: 3 });
    await renderShell();

    await expect(state.loaders?.pendingMemberCount()).resolves.toBe(3);
  });

  it("shows no badge to members who may not approve members", async () => {
    state.accountState = "allowed";
    state.countPendingMembers.mockRejectedValueOnce(new ForbiddenError("Access denied"));
    await renderShell();

    await expect(state.loaders?.pendingMemberCount()).resolves.toBe(0);
  });

  it("does not hide other failures", async () => {
    state.accountState = "allowed";
    state.countPendingMembers.mockRejectedValueOnce(new Error("database unavailable"));
    await renderShell();

    await expect(state.loaders?.pendingMemberCount()).rejects.toThrow("database unavailable");
  });
});
