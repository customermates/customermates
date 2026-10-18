import type { ReactElement } from "react";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listMyWorkspaces: vi.fn(),
  redirect: vi.fn(),
  resolveAccountState: vi.fn(),
  resolveOnboardingIntent: vi.fn(),
}));

vi.mock("next-intl/server", () => ({ getLocale: () => Promise.resolve("en") }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/components/shared/centered-card-page", () => ({ CenteredCardPage: () => null }));
vi.mock("@/core/di", () => ({ getListMyWorkspacesInteractor: () => ({ invoke: mocks.listMyWorkspaces }) }));
vi.mock("@/features/auth/next/resolve-account-state", () => ({
  resolveRequestAccountState: mocks.resolveAccountState,
}));
vi.mock("@/features/company/next/onboarding-intent", () => ({
  resolveOnboardingIntent: mocks.resolveOnboardingIntent,
}));
vi.mock("../invitation-card", () => ({ InvitationCard: () => null }));
vi.mock("../workspace-invitation-card", () => ({ WorkspaceInvitationCard: () => null }));

import { InvitationCard } from "../invitation-card";
import InvitationPage from "../page";
import { WorkspaceInvitationCard } from "../workspace-invitation-card";

type CardElement = ReactElement<Record<string, unknown>>;

function renderedCard(page: unknown): CardElement {
  return (page as ReactElement<{ children: CardElement }>).props.children;
}

function workspace(companyId: string, status: string) {
  return { companyId, isCurrent: false, name: null, status };
}

describe("InvitationPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveOnboardingIntent.mockResolvedValue({
      companyId: "invited-company",
      companyName: "Bergmann Steuern",
      expiresAt: new Date("2099-01-01T00:00:00.000Z"),
      intent: "signed-intent",
      inviterName: "Invite Admin",
      source: "explicit",
      status: "valid",
      token: "invite-token",
      type: "invitation",
    });
    mocks.listMyWorkspaces.mockResolvedValue({ ok: true, data: [workspace("own-company", "active")] });
    mocks.redirect.mockImplementation((path: string) => {
      throw new Error(`REDIRECT:${path}`);
    });
  });

  it("sends a signed-out visitor to sign-up with the invitation intent", async () => {
    mocks.resolveAccountState.mockResolvedValue({ state: "unauthenticated", sessionUser: null, user: null });

    await expect(InvitationPage({ searchParams: Promise.resolve({ intent: "signed-intent" }) })).rejects.toThrow(
      "REDIRECT:/en/auth/signup?intent=signed-intent",
    );
  });

  it("sends an overdue unverified identity without a tenant user through verification", async () => {
    mocks.resolveAccountState.mockResolvedValue({
      state: "overdueVerification",
      sessionUser: { email: "invited@example.com" },
      user: null,
    });

    await expect(InvitationPage({ searchParams: Promise.resolve({ intent: "signed-intent" }) })).rejects.toThrow(
      "REDIRECT:/en/auth/verify-email?intent=signed-intent",
    );
  });

  it("verifies an overdue identity before it can join another workspace", async () => {
    mocks.resolveAccountState.mockResolvedValue({
      state: "overdueVerification",
      sessionUser: { email: "member@example.com" },
      user: { id: "tenant-user" },
    });

    await expect(InvitationPage({ searchParams: Promise.resolve({ intent: "signed-intent" }) })).rejects.toThrow(
      "REDIRECT:/en/auth/verify-email?intent=signed-intent",
    );
    expect(mocks.listMyWorkspaces).not.toHaveBeenCalled();
  });

  it("offers a login with another workspace to join the named workspace", async () => {
    mocks.resolveAccountState.mockResolvedValue({
      state: "allowed",
      sessionUser: { email: "member@example.com" },
      user: { id: "tenant-user", companyId: "own-company" },
    });

    const card = renderedCard(await InvitationPage({ searchParams: Promise.resolve({ intent: "signed-intent" }) }));

    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(card.type).toBe(WorkspaceInvitationCard);
    expect(card.props).toEqual({
      email: "member@example.com",
      invitationIntent: "signed-intent",
      inviterName: "Invite Admin",
      membershipStatus: null,
      workspaceName: "Bergmann Steuern",
    });
  });

  it.each(["active", "pendingAuthorization", "inactive"])(
    "passes an existing %s membership of the invited workspace to the join card",
    async (status) => {
      mocks.resolveAccountState.mockResolvedValue({
        state: "pending",
        sessionUser: { email: "member@example.com" },
        user: { id: "tenant-user", companyId: "own-company" },
      });
      mocks.listMyWorkspaces.mockResolvedValue({
        ok: true,
        data: [workspace("own-company", "active"), workspace("invited-company", status)],
      });

      const card = renderedCard(await InvitationPage({ searchParams: Promise.resolve({ intent: "signed-intent" }) }));

      expect(card.type).toBe(WorkspaceInvitationCard);
      expect(card.props.membershipStatus).toBe(status);
    },
  );

  it("keeps the first-workspace flow for a signed-in login without any membership", async () => {
    mocks.resolveAccountState.mockResolvedValue({
      state: "unregistered",
      sessionUser: { email: "new@example.com" },
      user: null,
    });

    const card = renderedCard(await InvitationPage({ searchParams: Promise.resolve({ intent: "signed-intent" }) }));

    expect(card.type).toBe(InvitationCard);
    expect(card.props).toEqual({
      email: "new@example.com",
      invitationIntent: "signed-intent",
      inviterName: "Invite Admin",
      workspaceName: "Bergmann Steuern",
    });
    expect(mocks.listMyWorkspaces).not.toHaveBeenCalled();
  });
});
