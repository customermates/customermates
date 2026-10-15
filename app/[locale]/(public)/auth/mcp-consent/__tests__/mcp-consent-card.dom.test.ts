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

function render(workspaces: McpConsentWorkspace[]) {
  act(() =>
    root.render(
      createElement(McpConsentCard, {
        clientName: "Claude",
        consentCode: "consent-code",
        redirectHost: "claude.ai",
        scopes: ["openid"],
        workspaces,
      }),
    ),
  );
}

function headline() {
  return container.querySelector("h1")?.textContent;
}

function workspaceOption(companyId: string) {
  return container.querySelector<HTMLButtonElement>(`[id="mcp-consent-workspace-${companyId}"]`);
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

    expect(headline()).toBe(`McpConsentWorkspace.title ${JSON.stringify({ client: "Claude", workspace: "CRM" })}`);
    expect(container.querySelector(`label[for="mcp-consent-workspace-company-a"]`)?.textContent).toBe(
      "CRMMcpConsentWorkspace.current",
    );
    expect(workspaceOption("company-c")?.disabled).toBe(true);
    expect(container.querySelector(`label[for="mcp-consent-workspace-company-c"]`)?.textContent).toBe(
      "Workspaces.fallbackNameCommon.userStatuses.pendingAuthorization",
    );

    act(() => workspaceOption("company-b")?.click());

    expect(store.selectedCompanyId).toBe("company-b");
    expect(headline()).toBe(`McpConsentWorkspace.title ${JSON.stringify({ client: "Claude", workspace: "Taxes" })}`);
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
    expect(headline()).toBe(`McpConsentWorkspace.titleUnnamed ${JSON.stringify({ client: "Claude" })}`);
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
});
