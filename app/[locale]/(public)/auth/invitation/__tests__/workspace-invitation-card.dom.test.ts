import type { ReactNode } from "react";
import type { Root } from "react-dom/client";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Status } from "@/generated/prisma";

const harness = vi.hoisted(() => ({
  appMode: "cloud",
  enter: vi.fn(),
  joinWorkspaceAction: vi.fn(),
  signOutWithOnboardingIntentAction: vi.fn(),
  toastZodErrorTree: vi.fn(),
}));

vi.mock("../../actions", () => ({ joinWorkspaceAction: harness.joinWorkspaceAction }));
vi.mock("@/app/[locale]/actions", () => ({
  signOutWithOnboardingIntentAction: harness.signOutWithOnboardingIntentAction,
}));
vi.mock("next-intl", () => ({
  useTranslations: () =>
    Object.assign(
      (key: string, values?: Record<string, string>) => (values ? `${key} ${JSON.stringify(values)}` : key),
      { rich: (key: string) => key },
    ),
}));
vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => ({ appMode: harness.appMode, workspacesStore: { enter: harness.enter } }),
}));
vi.mock("@/core/errors/report-application-error", () => ({
  runUserAction: (action: () => unknown) => void action(),
}));
vi.mock("@/core/utils/toast-zod-error-tree", () => ({ toastZodErrorTree: harness.toastZodErrorTree }));
vi.mock("@/components/modal/use-navigation-guard", () => ({ useNavigationGuard: vi.fn() }));
vi.mock("@/components/shared/app-image", () => ({ AppImage: () => null }));
vi.mock("@/components/shared/app-link", () => ({
  AppLink: ({ href, children }: { href: string; children?: ReactNode }) => createElement("a", { href }, children),
}));
vi.mock("@/i18n/navigation", () => ({
  IntlLink: ({ href, children }: { href: string; children?: ReactNode }) => createElement("a", { href }, children),
}));

import { InvitationCard } from "../invitation-card";
import { WorkspaceInvitationCard } from "../workspace-invitation-card";

let container: HTMLDivElement;
let root: Root;

function render(membershipStatus: Status | null, workspaceName: string | null = "Bergmann Steuern") {
  act(() =>
    root.render(
      createElement(WorkspaceInvitationCard, {
        email: "ben@example.com",
        invitationIntent: "signed-intent",
        inviterName: "Invite Admin",
        membershipStatus,
        workspaceName,
      }),
    ),
  );
}

function terms() {
  return container.querySelector<HTMLButtonElement>("#workspace-invitation-terms");
}

function button(name: string) {
  return [...container.querySelectorAll("button")].find((candidate) => candidate.textContent === name);
}

async function click(element: HTMLElement | null | undefined) {
  await act(async () => {
    element?.click();
    await new Promise((resolve) => window.setTimeout(resolve, 1));
  });
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  harness.appMode = "cloud";
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("WorkspaceInvitationCard", () => {
  it("joins the named workspace and opens the pending screen", async () => {
    harness.joinWorkspaceAction.mockResolvedValue({
      ok: true,
      data: { companyId: "invited-company", status: Status.pendingAuthorization, alreadyMember: false },
    });
    render(null);

    expect(container.querySelector("h1")?.textContent).toBe(
      `WorkspaceInvitation.join.titleNamed ${JSON.stringify({ workspace: "Bergmann Steuern" })}`,
    );
    expect(container.textContent).toContain("OnboardingForm.invitedAgreeToTerms");
    expect(terms()?.getAttribute("aria-required")).toBe("true");

    await click(terms());
    await click(button("WorkspaceInvitation.join.action"));

    expect(harness.joinWorkspaceAction).toHaveBeenCalledExactlyOnceWith({
      intent: "signed-intent",
      agreeToTerms: true,
    });
    expect(harness.enter).toHaveBeenCalledExactlyOnceWith("/auth/pending");
  });

  it("opens a workspace the login already belongs to", async () => {
    harness.joinWorkspaceAction.mockResolvedValue({
      ok: true,
      data: { companyId: "invited-company", status: Status.active, alreadyMember: true },
    });
    render(Status.active);

    expect(terms()).toBeNull();

    await click(button("WorkspaceInvitation.member.action"));

    expect(harness.joinWorkspaceAction).toHaveBeenCalledExactlyOnceWith({
      intent: "signed-intent",
      agreeToTerms: false,
    });
    expect(harness.enter).toHaveBeenCalledExactlyOnceWith("/dashboard");
  });

  it("keeps the card usable and reports a failed join", async () => {
    const error = { errors: ["workspaceInvitationInvalid"] };
    harness.joinWorkspaceAction.mockResolvedValue({ ok: false, error });
    render(null, null);

    expect(container.querySelector("h1")?.textContent).toBe("WorkspaceInvitation.join.title");

    await click(button("WorkspaceInvitation.join.action"));

    expect(harness.toastZodErrorTree).toHaveBeenCalledWith(error);
    expect(harness.enter).not.toHaveBeenCalled();
    expect(button("WorkspaceInvitation.join.action")?.disabled).toBe(false);
  });

  it("toasts the refusal, marks the unticked terms and joins nothing", async () => {
    const error = { errors: [], properties: { agreeToTerms: { errors: ["Common.errors.termsNotAgreed"] } } };
    harness.joinWorkspaceAction.mockResolvedValue({ ok: false, error, code: "termsNotAgreed" });
    render(null);

    await click(button("WorkspaceInvitation.join.action"));

    expect(harness.joinWorkspaceAction).toHaveBeenCalledExactlyOnceWith({
      intent: "signed-intent",
      agreeToTerms: false,
    });
    expect(harness.toastZodErrorTree).toHaveBeenCalledWith(error);
    expect(terms()?.getAttribute("aria-invalid")).toBe("true");
    expect(harness.enter).not.toHaveBeenCalled();
  });

  it("offers only another account for a deactivated membership", () => {
    render(Status.inactive);

    expect(container.querySelector("h1")?.textContent).toBe("WorkspaceInvitation.inactive.title");
    expect([...container.querySelectorAll("button")].map((candidate) => candidate.textContent)).toEqual([
      "WorkspaceInvitation.otherAccount",
    ]);
  });

  it("hides the managed-service terms outside the cloud", () => {
    harness.appMode = "self-hosted";
    render(null);

    expect(terms()).toBeNull();
    expect(container.textContent).not.toContain("OnboardingForm.invitedAgreeToTerms");
  });

  it("signs out with the invitation kept for another account", async () => {
    harness.signOutWithOnboardingIntentAction.mockResolvedValue(undefined);
    render(null);

    await click(button("WorkspaceInvitation.otherAccount"));

    expect(harness.signOutWithOnboardingIntentAction).toHaveBeenCalledExactlyOnceWith("signed-intent");
  });
});

describe("InvitationCard", () => {
  function renderNewLogin(workspaceName: string | null) {
    act(() =>
      root.render(
        createElement(InvitationCard, {
          email: "new@example.com",
          invitationIntent: "signed-intent",
          inviterName: "Invite Admin",
          workspaceName,
        }),
      ),
    );
  }

  it("names the invited workspace with the wording of the join card", () => {
    renderNewLogin("Bergmann Steuern");

    expect(container.querySelector("h1")?.textContent).toBe(
      `InvitationCard.joinTitleNamed ${JSON.stringify({ workspace: "Bergmann Steuern" })}`,
    );
    expect(container.textContent).toContain(
      `InvitationCard.inviter ${JSON.stringify({ inviterName: "Invite Admin" })}`,
    );
  });

  it.each([null, "  "])("keeps the generic title when the workspace has no name (%j)", (workspaceName) => {
    renderNewLogin(workspaceName);

    expect(container.querySelector("h1")?.textContent).toBe("InvitationCard.joinTitle");
  });
});
