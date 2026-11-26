import type { Root } from "react-dom/client";
import type { RootStore } from "@/core/stores/root.store";
import type { McpConsentWorkspace } from "@/features/auth/list-mcp-consent-workspaces.interactor";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  decideMcpConsentAction: vi.fn(),
  rootStore: undefined as RootStore | undefined,
  tryNavigate: vi.fn(),
}));

vi.mock("@/app/[locale]/(public)/auth/actions", () => ({ decideMcpConsentAction: harness.decideMcpConsentAction }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("next-intl", () => ({
  useTranslations: () =>
    Object.assign(
      (key: string, values?: Record<string, string>) => (values ? `${key} ${JSON.stringify(values)}` : key),
      { rich: (key: string) => key },
    ),
}));
vi.mock("@/core/stores/root-store.provider", () => ({ useRootStore: () => harness.rootStore }));
vi.mock("@/components/shared/app-image", () => ({ AppImage: () => null }));
vi.mock("@/components/shared/app-link", () => ({ AppLink: "a" }));

import { McpConsentCard } from "../mcp-consent-card";
import { McpConsentStore } from "../mcp-consent.store";

import { workspaceAvatarStyle } from "@/app/components/workspaces/workspace-identity";

const crm: McpConsentWorkspace = {
  companyId: "company-a",
  name: "CRM",
  roleName: "Admin",
  isCurrent: true,
  unavailableReason: null,
  inactiveReason: null,
};
const taxes: McpConsentWorkspace = {
  companyId: "company-b",
  name: "Taxes",
  roleName: "Sales",
  isCurrent: false,
  unavailableReason: null,
  inactiveReason: null,
};
const waiting: McpConsentWorkspace = {
  companyId: "company-c",
  name: null,
  roleName: null,
  isCurrent: false,
  unavailableReason: "pending",
  inactiveReason: null,
};

let container: HTMLDivElement;
let root: Root;
let store: McpConsentStore;

function render(
  workspaces: McpConsentWorkspace[],
  options: { fixedWorkspace?: boolean; termsRequired?: boolean } = {},
) {
  act(() =>
    root.render(
      createElement(McpConsentCard, {
        clientName: "Claude",
        consentCode: "consent-code",
        fixedWorkspace: options.fixedWorkspace ?? false,
        redirectHost: "claude.ai",
        scopes: ["openid"],
        termsRequired: options.termsRequired ?? false,
        workspaces,
      }),
    ),
  );
}

function fixedWorkspaceRow(companyId: string) {
  return container.querySelector<HTMLElement>(`[id="mcp-consent-fixed-workspace-${companyId}"]`);
}

function workspaceRow(companyId: string) {
  return container.querySelector<HTMLElement>(`[id="mcp-consent-workspace-${companyId}"]`);
}

function headline() {
  return container.querySelector("h1")?.textContent;
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
  harness.decideMcpConsentAction.mockResolvedValue({ ok: true, data: { redirectURI: "https://claude.ai/callback" } });
  const rootStore = {
    localeStore: { getTranslation: (key: string) => key },
    navigationGuard: { tryNavigate: harness.tryNavigate },
  } as unknown as RootStore;
  store = new McpConsentStore(rootStore);
  Object.assign(rootStore, { mcpConsentStore: store });
  harness.rootStore = rootStore;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  harness.rootStore = undefined;
});

describe("McpConsentCard", () => {
  it("asks for the whole account and lists every workspace with its role, without a picker", () => {
    render([crm, taxes, waiting]);

    expect(headline()).toBe(`McpConsentWorkspace.accountTitle ${JSON.stringify({ client: "Claude" })}`);
    expect(container.querySelectorAll("[role='radio']")).toHaveLength(0);
    expect(workspaceRow("company-a")?.textContent).toBe("CCRMAdmin");
    expect(workspaceRow("company-b")?.textContent).toBe("TTaxesSales");
    expect(workspaceRow("company-c")?.textContent).toBe(
      "WWorkspaces.fallbackNameCommon.userStatuses.pendingAuthorization",
    );
    expect(container.querySelector("#mcp-consent-new-workspaces")?.textContent).toBe(
      "McpConsentWorkspace.newWorkspaces",
    );
    expect(container.textContent).toContain(`McpConsentWorkspace.accountHint ${JSON.stringify({ client: "Claude" })}`);
  });

  it("marks every workspace with the switcher's initial and colour, unavailable ones included", () => {
    render([crm, taxes, waiting]);

    for (const workspace of [crm, taxes, waiting]) {
      const avatar = workspaceRow(workspace.companyId)?.querySelector<HTMLElement>("[data-slot='avatar-fallback']");
      const { backgroundColor, color } = workspaceAvatarStyle(workspace.companyId);

      expect(avatar?.style.backgroundColor).toBe(backgroundColor);
      expect(avatar?.style.color).toBe(color);
    }
  });

  it("approves the connection for the account without naming a workspace", async () => {
    render([crm, taxes]);

    await click(button("McpConsentCard.approve"));

    expect(harness.decideMcpConsentAction).toHaveBeenCalledWith({ consentCode: "consent-code", accept: true });
    expect(harness.tryNavigate).toHaveBeenCalledOnce();
  });

  it("lets an account without any workspace approve once it accepts the terms", async () => {
    render([], { termsRequired: true });

    expect(container.querySelector("[id^='mcp-consent-workspace-']")).toBeNull();
    expect(container.querySelector("#mcp-consent-new-workspaces")).not.toBeNull();
    expect(button("McpConsentCard.approve")?.disabled).toBe(true);

    await click(container.querySelector<HTMLButtonElement>("#mcp-consent-terms"));
    expect(button("McpConsentCard.approve")?.disabled).toBe(false);

    await click(button("McpConsentCard.approve"));

    expect(harness.decideMcpConsentAction).toHaveBeenCalledWith({
      consentCode: "consent-code",
      accept: true,
      acceptTerms: true,
    });
  });

  it("only offers a denial when no workspace can be used", async () => {
    render([{ ...crm, unavailableReason: "permission" }]);

    expect(button("McpConsentCard.approve")).toBeUndefined();
    expect(container.textContent).toContain("McpConsentWorkspace.noneAvailable");

    await click(button("McpConsentCard.deny"));

    expect(harness.decideMcpConsentAction).toHaveBeenCalledWith({ consentCode: "consent-code", accept: false });
  });

  it("shows the workspace of an older per-workspace MCP URL with its avatar", async () => {
    render([taxes], { fixedWorkspace: true });

    expect(headline()).toBe(
      `McpConsentWorkspace.titleNamed ${JSON.stringify({ client: "Claude", workspace: "Taxes" })}`,
    );
    expect(container.querySelector("#mcp-consent-new-workspaces")).toBeNull();
    const row = fixedWorkspaceRow("company-b");
    expect(row?.textContent).toBe("TTaxes");
    expect(container.textContent).toContain(
      `McpConsentWorkspace.fixed.hint ${JSON.stringify({ client: "Claude", workspace: "Taxes" })}`,
    );

    await click(button("McpConsentCard.approve"));

    expect(harness.decideMcpConsentAction).toHaveBeenCalledWith({ consentCode: "consent-code", accept: true });
  });

  it.each([
    ["pending", "Common.userStatuses.pendingAuthorization"],
    ["inactive", "McpConsentWorkspace.unavailable.inactive"],
    ["permission", "McpConsentWorkspace.unavailable.permission"],
    ["plan", "McpConsentWorkspace.unavailable.plan"],
    ["terms", "McpConsentWorkspace.unavailable.terms"],
  ] as const)(
    "explains why the workspace of an older per-workspace MCP URL cannot be connected when it is %s",
    (reason, label) => {
      render([{ ...taxes, unavailableReason: reason }], { fixedWorkspace: true });

      expect(fixedWorkspaceRow("company-b")?.textContent).toBe(`TTaxes${label}`);
      expect(container.textContent).toContain(
        `McpConsentWorkspace.fixed.unavailable.${reason} ${JSON.stringify({ workspace: "Taxes" })}`,
      );
      expect(button("McpConsentCard.approve")).toBeUndefined();
    },
  );

  it.each([
    ["deactivated", `McpConsentWorkspace.fixed.unavailable.inactive ${JSON.stringify({ workspace: "Taxes" })}`],
    ["pausedByPlan", `PlanPausedCard.body ${JSON.stringify({ workspace: "Taxes" })}`],
    ["noActiveAdmin", "InactiveCard.supportBody"],
  ] as const)("tells a member whose access is inactive (%s) what brings it back", (inactiveReason, message) => {
    render([{ ...taxes, unavailableReason: "inactive", inactiveReason }], { fixedWorkspace: true });

    expect(container.textContent).toContain(message);
  });

  it("refuses an older per-workspace MCP URL of a workspace the login is not a member of without naming it", async () => {
    render([], { fixedWorkspace: true });

    expect(headline()).toBe(`McpConsentWorkspace.title ${JSON.stringify({ client: "Claude" })}`);
    expect(container.textContent).toContain("McpConsentWorkspace.fixed.notMember");
    expect(button("McpConsentCard.approve")).toBeUndefined();

    await click(button("McpConsentCard.deny"));

    expect(harness.decideMcpConsentAction).toHaveBeenCalledWith({ consentCode: "consent-code", accept: false });
  });
});
