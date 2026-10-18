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
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values ? `${key} ${JSON.stringify(values)}` : key,
}));
vi.mock("@/core/stores/root-store.provider", () => ({ useRootStore: () => harness.rootStore }));
vi.mock("@/components/shared/app-image", () => ({ AppImage: () => null }));

import { McpConsentCard } from "../mcp-consent-card";
import { McpConsentStore } from "../mcp-consent.store";

import { workspaceAvatarStyle } from "@/app/components/workspaces/workspace-identity";

const crm: McpConsentWorkspace = { companyId: "company-a", name: "CRM", isCurrent: true, unavailableReason: null };
const taxes: McpConsentWorkspace = { companyId: "company-b", name: "Taxes", isCurrent: false, unavailableReason: null };
const waiting: McpConsentWorkspace = {
  companyId: "company-c",
  name: null,
  isCurrent: false,
  unavailableReason: "pending",
};

let container: HTMLDivElement;
let root: Root;
let store: McpConsentStore;

function render(workspaces: McpConsentWorkspace[], fixedWorkspace = false) {
  act(() =>
    root.render(
      createElement(McpConsentCard, {
        clientName: "Claude",
        consentCode: "consent-code",
        fixedWorkspace,
        redirectHost: "claude.ai",
        scopes: ["openid"],
        workspaces,
      }),
    ),
  );
}

function fixedWorkspaceRow(companyId: string) {
  return container.querySelector<HTMLElement>(`[id="mcp-consent-fixed-workspace-${companyId}"]`);
}

function headline() {
  return container.querySelector("h1")?.textContent;
}

function workspaceOption(companyId: string) {
  return container.querySelector<HTMLButtonElement>(`[id="mcp-consent-workspace-${companyId}"]`);
}

function optionLabel(companyId: string) {
  return container.querySelector<HTMLLabelElement>(`label[for="mcp-consent-workspace-${companyId}"]`);
}

function optionAvatar(companyId: string) {
  return optionLabel(companyId)?.querySelector<HTMLElement>("[data-slot='avatar-fallback']");
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
  it("names the selected workspace and lets the person pick another available one", () => {
    render([crm, taxes, waiting]);

    expect(headline()).toBe(`McpConsentWorkspace.titleNamed ${JSON.stringify({ client: "Claude", workspace: "CRM" })}`);
    expect(optionLabel("company-a")?.textContent).toBe("CCRMMcpConsentWorkspace.current");
    expect(workspaceOption("company-c")?.disabled).toBe(true);
    expect(optionLabel("company-c")?.textContent).toBe(
      "WWorkspaces.fallbackNameCommon.userStatuses.pendingAuthorization",
    );

    act(() => workspaceOption("company-b")?.click());

    expect(store.selectedCompanyId).toBe("company-b");
    expect(headline()).toBe(
      `McpConsentWorkspace.titleNamed ${JSON.stringify({ client: "Claude", workspace: "Taxes" })}`,
    );
  });

  it("marks every workspace with the switcher's initial and colour, unavailable ones included", () => {
    render([crm, taxes, waiting]);

    for (const workspace of [crm, taxes, waiting]) {
      const avatar = optionAvatar(workspace.companyId);
      const { backgroundColor, color } = workspaceAvatarStyle(workspace.companyId);

      expect(avatar?.closest("[data-slot='avatar']")?.getAttribute("data-size")).toBe("sm");
      expect(avatar?.style.backgroundColor).toBe(backgroundColor);
      expect(avatar?.style.color).toBe(color);
    }
    expect(optionAvatar("company-b")?.textContent).toBe("T");
    expect(optionAvatar("company-c")?.textContent).toBe("W");
  });

  it("approves the connection for the chosen workspace", async () => {
    render([crm, taxes]);
    act(() => workspaceOption("company-b")?.click());

    await click(button("McpConsentCard.approve"));

    expect(harness.decideMcpConsentAction).toHaveBeenCalledWith({
      consentCode: "consent-code",
      accept: true,
      companyId: "company-b",
    });
    expect(harness.tryNavigate).toHaveBeenCalledOnce();
  });

  it("shows no picker for a single workspace and uses the unnamed headline", () => {
    render([{ ...crm, name: null }]);

    expect(workspaceOption("company-a")).toBeNull();
    expect(headline()).toBe(`McpConsentWorkspace.title ${JSON.stringify({ client: "Claude" })}`);
    expect(button("McpConsentCard.approve")).toBeDefined();
  });

  it("only offers a denial when no workspace can be connected", async () => {
    render([{ ...crm, unavailableReason: "permission" }]);

    expect(button("McpConsentCard.approve")).toBeUndefined();
    expect(container.textContent).toContain("McpConsentCard.permissionRequired");

    await click(button("McpConsentCard.deny"));

    expect(harness.decideMcpConsentAction).toHaveBeenCalledWith({
      consentCode: "consent-code",
      accept: false,
      companyId: "company-a",
    });
  });

  it("shows the workspace of a per-workspace MCP URL with its avatar and no picker", async () => {
    render([taxes], true);

    expect(headline()).toBe(
      `McpConsentWorkspace.titleNamed ${JSON.stringify({ client: "Claude", workspace: "Taxes" })}`,
    );
    expect(container.querySelectorAll("[role='radio']")).toHaveLength(0);
    expect(container.textContent).not.toContain("McpConsentWorkspace.pickerLabel");
    const row = fixedWorkspaceRow("company-b");
    expect(row?.textContent).toBe("TTaxes");
    expect(row?.querySelector<HTMLElement>("[data-slot='avatar-fallback']")?.style.backgroundColor).toBe(
      workspaceAvatarStyle("company-b").backgroundColor,
    );
    expect(container.textContent).toContain(
      `McpConsentWorkspace.fixed.hint ${JSON.stringify({ client: "Claude", workspace: "Taxes" })}`,
    );
    expect(container.textContent).not.toContain("McpConsentWorkspace.scopeHint");
    expect(container.textContent).not.toContain("McpConsentCard.permissionRequired");

    await click(button("McpConsentCard.approve"));

    expect(harness.decideMcpConsentAction).toHaveBeenCalledWith({
      consentCode: "consent-code",
      accept: true,
      companyId: "company-b",
    });
  });

  it.each([
    ["pending", "Common.userStatuses.pendingAuthorization"],
    ["inactive", "McpConsentWorkspace.unavailable.inactive"],
    ["permission", "McpConsentWorkspace.unavailable.permission"],
    ["plan", "McpConsentWorkspace.unavailable.plan"],
    ["terms", "McpConsentWorkspace.unavailable.terms"],
  ] as const)(
    "explains why the workspace of a per-workspace MCP URL cannot be connected when it is %s",
    async (reason, label) => {
      render([{ ...taxes, unavailableReason: reason }], true);

      expect(fixedWorkspaceRow("company-b")?.textContent).toBe(`TTaxes${label}`);
      expect(container.textContent).toContain(
        `McpConsentWorkspace.fixed.unavailable.${reason} ${JSON.stringify({ workspace: "Taxes" })}`,
      );
      expect(container.textContent).not.toContain("McpConsentWorkspace.fixed.hint");
      expect(button("McpConsentCard.approve")).toBeUndefined();

      await click(button("McpConsentCard.deny"));

      expect(harness.decideMcpConsentAction).toHaveBeenCalledWith({
        consentCode: "consent-code",
        accept: false,
        companyId: "company-b",
      });
    },
  );

  it("refuses a per-workspace MCP URL of a workspace the login is not a member of without naming it", async () => {
    render([], true);

    expect(headline()).toBe(`McpConsentWorkspace.title ${JSON.stringify({ client: "Claude" })}`);
    expect(container.querySelector("[id^='mcp-consent-fixed-workspace-']")).toBeNull();
    expect(container.textContent).toContain("McpConsentWorkspace.fixed.notMember");
    expect(button("McpConsentCard.approve")).toBeUndefined();

    await click(button("McpConsentCard.deny"));

    expect(harness.decideMcpConsentAction).toHaveBeenCalledWith({ consentCode: "consent-code", accept: false });
  });
});
