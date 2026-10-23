import type { Root } from "react-dom/client";
import type { RootStore } from "@/core/stores/root.store";
import type { WorkspaceSummary } from "@/features/workspace/workspace.schema";

import { act, createElement, StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Action, Resource } from "@/generated/prisma";

const harness = vi.hoisted(() => ({ rootStore: null as unknown }));

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) =>
    values ? `${key}:${Object.values(values).join(",")}` : key,
}));
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("../../../actions", () => ({ renameWorkspaceAction: vi.fn(), updateWorkspaceSlugAction: vi.fn() }));
vi.mock("@/app/[locale]/(protected)/w/[workspace]/settings/(account)/workspaces/actions", () => ({
  deleteWorkspaceAction: vi.fn(),
  leaveWorkspaceAction: vi.fn(),
  listMyWorkspacesAction: vi.fn(),
  withdrawWorkspaceRequestAction: vi.fn(),
}));
vi.mock("@/core/stores/root-store.provider", () => ({ useRootStore: () => harness.rootStore }));

import { WorkspaceGeneralStore } from "../workspace-general.store";
import { WorkspaceGeneralView } from "../workspace-general-view";

const workspace: WorkspaceSummary = {
  companyId: "00000000-0000-4000-8000-000000000001",
  name: "Bergmann Steuern",
  slug: "bergmann-steuern",
  status: "active",
  roleName: "Admin",
  isAdmin: true,
  isCurrent: true,
  activeMemberCount: 2,
  subscription: null,
  joinedAt: new Date("2026-01-01T00:00:00.000Z"),
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
};

function freshRootStore(canUpdate: boolean) {
  const rootStore = {
    appMode: "cloud",
    navigationGuard: { register: vi.fn(), unregister: vi.fn(), isGuarding: false, tryNavigate: vi.fn() },
    userStore: {
      user: { id: "user-1" },
      can: (resource: Resource, action: Action) =>
        canUpdate && resource === Resource.company && action === Action.update,
    },
    workspacesStore: { deleteCurrent: vi.fn(), leaveCurrent: vi.fn(), renameCurrent: vi.fn() },
  };
  Object.assign(rootStore, { workspaceGeneralStore: new WorkspaceGeneralStore(rootStore as unknown as RootStore) });
  harness.rootStore = rootStore;
}

let root: Root | undefined;
let container: HTMLDivElement | undefined;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  document.body.innerHTML = "";
});

describe("WorkspaceGeneralView", () => {
  it("renders the workspace on the server and hydrates it without a mismatch", async () => {
    freshRootStore(true);
    const html = renderToString(
      createElement(WorkspaceGeneralView, { deleteRefusal: null, leaveRefusal: null, workspace }),
    );
    expect(html).toContain(">BS<");
    expect(html).not.toContain("Workspaces.fallbackName");

    container = document.createElement("div");
    container.innerHTML = html;
    document.body.append(container);
    freshRootStore(true);
    const recoverableErrors: unknown[] = [];
    await act(async () => {
      root = hydrateRoot(
        container as HTMLDivElement,
        createElement(
          StrictMode,
          null,
          createElement(WorkspaceGeneralView, { deleteRefusal: null, leaveRefusal: null, workspace }),
        ),
        {
          onRecoverableError: (error) => recoverableErrors.push(error),
        },
      );
      await Promise.resolve();
    });

    expect(recoverableErrors).toEqual([]);
    expect(document.querySelector<HTMLInputElement>("#settings-general-name")?.value).toBe("Bergmann Steuern");
  });

  it("shows the name read-only and without a required marker to members who may not rename", () => {
    freshRootStore(false);
    const html = renderToString(
      createElement(WorkspaceGeneralView, { deleteRefusal: null, leaveRefusal: null, workspace }),
    );
    container = document.createElement("div");
    container.innerHTML = html;

    const input = container.querySelector<HTMLInputElement>("#settings-general-name");
    expect(input?.hasAttribute("readonly")).toBe(true);
    expect(input?.hasAttribute("required")).toBe(false);
    expect(container.textContent).toContain("Workspaces.renameReadOnly");
    const slug = container.querySelector<HTMLInputElement>("#settings-general-slug");
    expect(slug?.value).toBe("bergmann-steuern");
    expect(slug?.hasAttribute("readonly")).toBe(true);
    expect(container.textContent).toContain("Workspaces.slugReadOnly:/w/bergmann-steuern");
    expect(container.querySelector("#settings-general-leave")).not.toBeNull();
  });

  it("puts leaving into the shared danger alert with its secondary action, like the app's other alert actions", () => {
    freshRootStore(true);
    container = document.createElement("div");
    container.innerHTML = renderToString(
      createElement(WorkspaceGeneralView, { deleteRefusal: null, leaveRefusal: null, workspace }),
    );

    const zone = container.querySelector("section[aria-labelledby='settings-general-danger-zone']");
    const alert = zone?.querySelector<HTMLElement>("[data-slot='alert']");
    const leave = alert?.querySelector<HTMLButtonElement>("#settings-general-leave");

    expect(alert?.getAttribute("role")).toBe("note");
    expect(alert?.className).toContain("border-destructive/30");
    expect(alert?.querySelector("[data-slot='alert-title']")?.textContent).toBe("Workspaces.leave");
    expect(alert?.querySelector("[data-slot='alert-description']")?.textContent).toBe("Workspaces.leaveDescription");
    expect(leave?.dataset.variant).toBe("secondary");
    expect(leave?.dataset.size).toBe("sm");
  });
  it("blocks leaving up front for the only admin and names the reason, like removing the last admin", () => {
    freshRootStore(true);
    container = document.createElement("div");
    document.body.append(container);
    container.innerHTML = renderToString(
      createElement(WorkspaceGeneralView, { deleteRefusal: null, leaveRefusal: "lastAdmin", workspace }),
    );

    const leave = container.querySelector<HTMLButtonElement>("#settings-general-leave");
    const trigger = container.querySelector<HTMLElement>("[data-slot='leave-workspace-blocked']");

    expect(leave?.disabled).toBe(true);
    expect(trigger?.getAttribute("aria-disabled")).toBe("true");
    expect(trigger?.getAttribute("aria-label")).toBe("Workspaces.leave");
    expect(trigger?.contains(leave ?? null)).toBe(true);
  });

  it("shows the leave blocker as text next to the button on small and touch screens, where tooltips cannot open", () => {
    freshRootStore(true);
    container = document.createElement("div");
    document.body.append(container);
    container.innerHTML = renderToString(
      createElement(WorkspaceGeneralView, { deleteRefusal: null, leaveRefusal: "lastAdmin", workspace }),
    );

    const alert = container.querySelector<HTMLElement>("[data-slot='alert']");
    const trigger = container.querySelector<HTMLElement>("[data-slot='leave-workspace-blocked']");
    const reason = container.querySelector<HTMLElement>("[data-slot='leave-workspace-reason']");

    expect(reason?.textContent).toBe("Common.errors.workspaceLastAdmin");
    expect(alert?.contains(reason ?? null)).toBe(true);
    expect(reason?.id).toBe("settings-general-leave-reason");
    expect(trigger?.getAttribute("aria-describedby")).toBe(reason?.id);
    expect(reason?.classList).toContain("hidden");
    expect(reason?.classList).toContain("max-sm:block");
    expect(reason?.classList).toContain("pointer-coarse:block");
  });

  it("offers leaving to an admin who is not the last one", () => {
    freshRootStore(true);
    container = document.createElement("div");
    container.innerHTML = renderToString(
      createElement(WorkspaceGeneralView, { deleteRefusal: null, leaveRefusal: null, workspace }),
    );

    expect(container.querySelector<HTMLButtonElement>("#settings-general-leave")?.disabled).toBe(false);
    expect(container.querySelector("[data-slot='leave-workspace-blocked']")).toBeNull();
    expect(container.querySelector("[data-slot='leave-workspace-reason']")).toBeNull();
  });

  it("offers deleting next to leaving to an admin the workspace allows to delete it", () => {
    freshRootStore(true);
    container = document.createElement("div");
    container.innerHTML = renderToString(
      createElement(WorkspaceGeneralView, { deleteRefusal: null, leaveRefusal: null, workspace }),
    );

    const zone = container.querySelector("section[aria-labelledby='settings-general-danger-zone']");
    const alerts = zone?.querySelectorAll<HTMLElement>("[data-slot='alert']");
    const remove = zone?.querySelector<HTMLButtonElement>("#settings-general-delete");

    expect(alerts?.length).toBe(2);
    expect(alerts?.[1]?.querySelector("[data-slot='alert-title']")?.textContent).toBe("Workspaces.delete");
    expect(remove?.disabled).toBe(false);
    expect(zone?.querySelector("[data-slot='delete-workspace-blocked']")).toBeNull();
  });

  it("disables deleting with the reason as a tooltip trigger and as text on touch screens", () => {
    freshRootStore(true);
    container = document.createElement("div");
    document.body.append(container);
    container.innerHTML = renderToString(
      createElement(WorkspaceGeneralView, { deleteRefusal: "billingActive", leaveRefusal: null, workspace }),
    );

    const remove = container.querySelector<HTMLButtonElement>("#settings-general-delete");
    const trigger = container.querySelector<HTMLElement>("[data-slot='delete-workspace-blocked']");
    const reason = container.querySelector<HTMLElement>("[data-slot='delete-workspace-reason']");

    expect(remove?.disabled).toBe(true);
    expect(trigger?.getAttribute("aria-label")).toBe("Workspaces.delete");
    expect(trigger?.getAttribute("aria-describedby")).toBe("settings-general-delete-reason");
    expect(reason?.textContent).toBe("Workspaces.deleteBlocked.billingActive");
    expect(reason?.classList).toContain("max-sm:block");
    expect(reason?.classList).toContain("pointer-coarse:block");
  });

  it("does not offer deleting to a member who is not an admin", () => {
    freshRootStore(false);
    container = document.createElement("div");
    container.innerHTML = renderToString(
      createElement(WorkspaceGeneralView, {
        deleteRefusal: "notAdmin",
        leaveRefusal: null,
        workspace: { ...workspace, isAdmin: false, roleName: "Member" },
      }),
    );

    expect(container.querySelector("#settings-general-delete")).toBeNull();
    expect(container.querySelector("#settings-general-leave")).not.toBeNull();
  });

  it("asks admins to name an unnamed workspace, and only them", () => {
    freshRootStore(true);
    container = document.createElement("div");
    container.innerHTML = renderToString(
      createElement(WorkspaceGeneralView, {
        deleteRefusal: null,
        leaveRefusal: null,
        workspace: { ...workspace, name: null },
      }),
    );
    expect(container.querySelector("#settings-general-unnamed")?.textContent).toContain(
      "Workspaces.unnamedPrompt.title",
    );

    freshRootStore(false);
    container.innerHTML = renderToString(
      createElement(WorkspaceGeneralView, {
        deleteRefusal: null,
        leaveRefusal: null,
        workspace: { ...workspace, name: null },
      }),
    );
    expect(container.querySelector("#settings-general-unnamed")).toBeNull();

    freshRootStore(true);
    container.innerHTML = renderToString(
      createElement(WorkspaceGeneralView, { deleteRefusal: null, leaveRefusal: null, workspace }),
    );
    expect(container.querySelector("#settings-general-unnamed")).toBeNull();
  });

  it("shows the workspace URL as its own editable field with the /w/ prefix to members who may manage it", () => {
    freshRootStore(true);
    container = document.createElement("div");
    container.innerHTML = renderToString(
      createElement(WorkspaceGeneralView, { deleteRefusal: null, leaveRefusal: null, workspace }),
    );

    const slug = container.querySelector<HTMLInputElement>("#settings-general-slug");
    expect(slug?.value).toBe("bergmann-steuern");
    expect(slug?.hasAttribute("readonly")).toBe(false);
    expect(slug?.maxLength).toBe(40);
    expect(container.textContent).toContain("Workspaces.slugLabel");
    expect(container.textContent).toContain("Workspaces.slugDescription:/w/bergmann-steuern");
  });

  it("keeps the workspace URL read-only in the demo like the name", () => {
    freshRootStore(true);
    Object.assign(harness.rootStore as object, { appMode: "demo" });
    container = document.createElement("div");
    container.innerHTML = renderToString(
      createElement(WorkspaceGeneralView, { deleteRefusal: null, leaveRefusal: null, workspace }),
    );

    expect(container.querySelector("#settings-general-slug")?.hasAttribute("readonly")).toBe(true);
    expect(container.querySelector("#settings-general-name")?.hasAttribute("readonly")).toBe(true);
  });
});
