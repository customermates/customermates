import type { Root } from "react-dom/client";
import type { RootStore } from "@/core/stores/root.store";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({ rootStore: null as unknown }));

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/app/[locale]/(protected)/w/[workspace]/settings/(account)/workspaces/actions", () => ({
  deleteWorkspaceAction: vi.fn(),
  leaveWorkspaceAction: vi.fn(),
  listMyWorkspacesAction: vi.fn(),
  withdrawWorkspaceRequestAction: vi.fn(),
}));
vi.mock("@/core/stores/root-store.provider", () => ({ useRootStore: () => harness.rootStore }));

import { WORKSPACE_CHANGED_DIGEST } from "@/core/errors/workspace-changed";
import { reportApplicationError } from "@/core/errors/report-application-error";

import { WorkspaceUnavailableDialog } from "../workspace-unavailable-dialog";
import { WorkspacesStore } from "../workspaces.store";

const navigateDocument = vi.fn();
let root: Root | undefined;
let container: HTMLDivElement | undefined;

function mount() {
  const fakeRoot = {
    appMode: "cloud",
    localeStore: { locale: "de" },
    loadingOverlayStore: { setIsLoading: vi.fn() },
    navigationGuard: { tryNavigate: vi.fn(), navigateDocument },
  };
  const workspacesStore = new WorkspacesStore(fakeRoot as unknown as RootStore);
  harness.rootStore = { workspacesStore };
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root?.render(createElement(WorkspaceUnavailableDialog)));
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
  act(() => root?.unmount());
  container?.remove();
  document.body.innerHTML = "";
});

describe("WorkspaceUnavailableDialog", () => {
  it("stays hidden while the workspace of this tab is available", () => {
    mount();

    expect(dialog()).toBeNull();
  });

  it("blocks the page when the server answers that this tab's workspace is unavailable, and opens the generic entry", async () => {
    mount();

    act(() =>
      reportApplicationError(Object.assign(new Error("redacted in production"), { digest: WORKSPACE_CHANGED_DIGEST })),
    );

    await vi.waitFor(() => expect(dialog()?.textContent).toContain("Workspaces.unavailable.title"));
    expect(dialog()?.textContent).toContain("Workspaces.unavailable.description");
    expect(document.getElementById("workspace-unavailable-cancel")).toBeNull();

    act(() => {
      dialog()?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(dialog()).not.toBeNull();

    act(() => document.getElementById("workspace-unavailable")?.click());
    await vi.waitFor(() => expect(navigateDocument).toHaveBeenCalledWith("/de/dashboard"));
  });

  it("opens when a store reports the workspace unavailable", async () => {
    const store = mount();

    act(() => store.showUnavailable());

    await vi.waitFor(() => expect(dialog()?.textContent).toContain("Workspaces.unavailable.open"));
  });
});
