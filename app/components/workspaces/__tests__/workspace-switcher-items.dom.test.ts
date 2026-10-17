import type { Root } from "react-dom/client";
import type { WorkspaceSummary } from "@/features/workspace/workspace.schema";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({ items: [] as WorkspaceSummary[], canCreate: true }));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => ({ workspacesStore: { items: harness.items, canCreate: harness.canCreate } }),
}));

import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

import { WorkspaceSwitcherItems } from "../workspace-switcher-items";

function workspace(
  companyId: string,
  name: string | null,
  overrides: Partial<WorkspaceSummary> = {},
): WorkspaceSummary {
  return {
    companyId,
    name,
    status: "active",
    roleName: "Admin",
    isAdmin: true,
    isCurrent: false,
    activeMemberCount: 1,
    subscription: null,
    joinedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

const onSwitch = vi.fn();
const onCreate = vi.fn();
let root: Root | undefined;
let container: HTMLDivElement | undefined;

function render() {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() =>
    root?.render(
      createElement(
        DropdownMenu,
        { open: true, modal: false },
        createElement(DropdownMenuTrigger, null, "menu"),
        createElement(DropdownMenuContent, null, createElement(WorkspaceSwitcherItems, { onCreate, onSwitch })),
      ),
    ),
  );
}

function item(companyId: string) {
  return document.querySelector<HTMLElement>(`[role='menuitem'][data-workspace-id='${companyId}']`);
}

function press(element: HTMLElement | null, key: string) {
  act(() => {
    element?.focus();
    element?.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  });
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  onSwitch.mockReset();
  onCreate.mockReset();
  harness.canCreate = true;
  harness.items = [
    workspace("company-a", "Acme", { isCurrent: true }),
    workspace("company-b", null),
    workspace("company-c", "Taxes", { status: "pendingAuthorization" }),
  ];
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  document.body.innerHTML = "";
});

describe("WorkspaceSwitcherItems", () => {
  it("lists every workspace with the current one checked and pending ones badged", () => {
    render();

    const current = item("company-a");
    expect(current?.getAttribute("aria-current")).toBe("true");
    expect(current?.querySelector("svg")).not.toBeNull();
    expect(item("company-b")?.textContent).toContain("Workspaces.fallbackName");
    expect(item("company-b")?.getAttribute("aria-current")).toBeNull();
    expect(item("company-c")?.textContent).toContain("Common.userStatuses.pendingAuthorization");
    expect(document.getElementById("workspace-menu-create")?.textContent).toContain("Workspaces.create");
  });

  it("switches to another workspace from the keyboard and ignores the current one", () => {
    render();

    press(item("company-b"), "Enter");
    expect(onSwitch).toHaveBeenCalledWith("company-b");

    press(item("company-a"), "Enter");
    expect(onSwitch).toHaveBeenCalledOnce();
  });

  it("offers creating a workspace only where it is possible", () => {
    render();
    press(document.getElementById("workspace-menu-create"), "Enter");
    expect(onCreate).toHaveBeenCalledOnce();

    act(() => root?.unmount());
    harness.canCreate = false;
    render();
    expect(document.getElementById("workspace-menu-create")).toBeNull();
  });
});
