import type { Root } from "react-dom/client";
import type { RootStore } from "@/core/stores/root.store";
import type { WorkspaceSummary } from "@/features/workspace/workspace.schema";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({ rootStore: null as unknown }));

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values ? `${key}:${Object.values(values).join(",")}` : key,
}));
vi.mock("@/app/[locale]/(protected)/settings/(account)/workspaces/actions", () => ({
  leaveWorkspaceAction: vi.fn(),
  listMyWorkspacesAction: vi.fn(),
  switchWorkspaceAction: vi.fn(),
}));
vi.mock("@/core/stores/root-store.provider", () => ({ useRootStore: () => harness.rootStore }));

import { WORKSPACE_CHANGED_DIGEST } from "@/core/errors/workspace-changed";
import { reportApplicationError } from "@/core/errors/report-application-error";

import { WorkspaceTabChannel } from "../workspace-tab-channel";
import { WorkspaceTabGuard } from "../workspace-tab-guard";
import { WorkspacesStore } from "../workspaces.store";

function workspace(companyId: string, name: string | null, isCurrent: boolean): WorkspaceSummary {
  return {
    companyId,
    name,
    status: "active",
    roleName: "Admin",
    isAdmin: true,
    isCurrent,
    activeMemberCount: 1,
    subscription: null,
    joinedAt: new Date("2026-01-01T00:00:00.000Z"),
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
  };
}

const navigateDocument = vi.fn();
let root: Root | undefined;
let container: HTMLDivElement | undefined;
const disposers: Array<() => void> = [];

function mount() {
  const fakeRoot = {
    appMode: "cloud",
    localeStore: { locale: "de" },
    loadingOverlayStore: { setIsLoading: vi.fn() },
    navigationGuard: { tryNavigate: vi.fn(), navigateDocument },
  };
  const workspacesStore = new WorkspacesStore(fakeRoot as unknown as RootStore);
  workspacesStore.setWorkspaces([workspace("company-a", "Acme", true), workspace("company-b", "Taxes", false)]);
  harness.rootStore = { workspacesStore };
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root?.render(createElement(WorkspaceTabGuard)));
  return workspacesStore;
}

function dialog() {
  return document.querySelector<HTMLElement>("[data-slot='confirm-dialog']");
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  navigateDocument.mockReset();
});

afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
  act(() => root?.unmount());
  container?.remove();
  document.body.innerHTML = "";
});

describe("WorkspaceTabGuard", () => {
  it("tells the other tabs which workspace this page shows", async () => {
    const listener = vi.fn();
    disposers.push(new WorkspaceTabChannel().open(listener));

    mount();

    await vi.waitFor(() => expect(listener).toHaveBeenCalledWith({ companyId: "company-a", name: "Acme" }));
    expect(dialog()).toBeNull();
  });

  it("blocks the page until it reloads when another tab switched to a different workspace", async () => {
    mount();

    act(() => new WorkspaceTabChannel().post({ companyId: "company-b", name: "Taxes" }));

    await vi.waitFor(() => expect(dialog()).not.toBeNull());
    expect(dialog()?.textContent).toContain("Workspaces.otherTab.titleNamed:Taxes");
    expect(dialog()?.textContent).toContain("Workspaces.otherTab.description:Acme");
    expect(document.getElementById("workspace-other-tab-cancel")).toBeNull();

    act(() => {
      dialog()?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(dialog()).not.toBeNull();

    act(() => document.getElementById("workspace-other-tab")?.click());
    expect(navigateDocument).toHaveBeenCalledWith("/de/dashboard");
  });

  it("names no workspace when the other tab left one", async () => {
    mount();

    act(() => new WorkspaceTabChannel().post({ companyId: null, name: null }));

    await vi.waitFor(() => expect(dialog()?.textContent).toContain("Workspaces.otherTab.titleChanged"));
    expect(dialog()?.textContent).not.toContain("titleNamed");
  });

  it("blocks the page when the server refuses an action because this session's workspace changed", async () => {
    mount();

    act(() =>
      reportApplicationError(Object.assign(new Error("redacted in production"), { digest: WORKSPACE_CHANGED_DIGEST })),
    );

    await vi.waitFor(() => expect(dialog()?.textContent).toContain("Workspaces.otherTab.titleChanged"));
    act(() => document.getElementById("workspace-other-tab")?.click());
    expect(navigateDocument).toHaveBeenCalledWith("/de/dashboard");
  });

  it("stays out of the way when another tab opens the workspace this page shows", async () => {
    const store = mount();
    const listener = vi.fn();
    disposers.push(new WorkspaceTabChannel().open(listener));

    act(() => new WorkspaceTabChannel().post({ companyId: "company-a", name: "Acme" }));
    act(() => new WorkspaceTabChannel().post({ companyId: "company-a", name: "Acme" }));

    await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(2));
    expect(store.foreignNotice).toBeNull();
    expect(dialog()).toBeNull();
  });
});
