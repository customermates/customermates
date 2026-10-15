import type { Root } from "react-dom/client";
import type { WorkspaceSummary } from "@/features/workspace/workspace.schema";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  others: [] as WorkspaceSummary[],
  canCreate: true,
  requestSwitch: vi.fn(),
  start: vi.fn(),
}));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => ({
    createWorkspaceModalStore: { start: harness.start },
    workspacesStore: { others: harness.others, canCreate: harness.canCreate, requestSwitch: harness.requestSwitch },
  }),
}));

import { RestrictedWorkspaceSwitch } from "../restricted-workspace-switch";

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

let root: Root | undefined;
let container: HTMLDivElement | undefined;

function render() {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root?.render(createElement(RestrictedWorkspaceSwitch)));
}

function card() {
  return document.querySelector<HTMLElement>("[data-slot='restricted-workspace-switch']");
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  harness.requestSwitch.mockReset();
  harness.start.mockReset();
  harness.canCreate = true;
  harness.others = [workspace("company-b", "Taxes"), workspace("company-c", null, { status: "inactive" })];
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  document.body.innerHTML = "";
});

describe("RestrictedWorkspaceSwitch", () => {
  it("lets a blocked person switch to another workspace", () => {
    render();

    expect(card()?.querySelector("h2")?.textContent).toBe("Workspaces.switchWorkspace");
    const rows = [...(card()?.querySelectorAll<HTMLButtonElement>("button[data-workspace-id]") ?? [])];
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining("Taxes"),
      expect.stringContaining("Workspaces.fallbackName"),
    ]);
    expect(rows[1]?.textContent).toContain("Common.userStatuses.inactive");

    act(() => rows[0]?.click());
    expect(harness.requestSwitch).toHaveBeenCalledWith("company-b");
  });

  it("offers creating a workspace, also when there is no other workspace", () => {
    harness.others = [];
    render();

    expect(card()?.querySelector("h2")?.textContent).toBe("Workspaces.restrictedCreateHint");
    const create = document.getElementById("restricted-create-workspace");
    act(() => create?.click());
    expect(harness.start).toHaveBeenCalledWith(create);
  });

  it("renders nothing when there is neither another workspace nor a way to create one", () => {
    harness.others = [];
    harness.canCreate = false;
    render();

    expect(card()).toBeNull();
  });
});
