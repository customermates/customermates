// @vitest-environment jsdom

import type { Root } from "react-dom/client";
import type { ReactNode } from "react";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => {
  const store = {
    add: vi.fn(),
    canManage: false,
    close: vi.fn(),
    customColumns: [],
    entityLoadState: "ready",
    fetchedEntity: { id: "deal-1", name: "Renewal" },
    hasUnsavedChanges: false,
    loadById: vi.fn(),
    resetForm: vi.fn(),
    withUnsavedChangesGuard: true,
  };

  return {
    popTop: vi.fn(),
    rootStore: {
      agentChatStore: { contextRegistry: { register: vi.fn(() => () => undefined) } },
      userStore: { canAccess: () => true, user: { id: "user-1" } },
    },
    store,
  };
});

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("next/navigation", () => ({ usePathname: () => "/en/deals" }));
vi.mock("@/app/actions", () => ({ getP13nAction: vi.fn() }));
vi.mock("@/components/entity-detail/hooks/use-entity-drawer-stack", () => ({
  focusEntityDrawerInvoker: () => false,
  useEntityDrawerStack: () => ({ popTop: harness.popTop, top: { entityType: "deal", id: "deal-1" } }),
}));
vi.mock("@/components/entity-detail/entity-detail.registry", () => ({
  ENTITY_DETAIL: {
    deal: {
      DetailView: () => createElement("input", { "aria-label": "Name", id: "name" }),
      identity: (entity: { name: string }) => ({ name: entity.name }),
      store: () => harness.store,
    },
  },
}));
vi.mock("@/core/stores/root-store.provider", () => ({ useRootStore: () => harness.rootStore }));
vi.mock("@/components/entity-terminology/use-entity-terminology", () => ({
  useEntityTerminology: () => ({ singular: () => "Deal" }),
}));
vi.mock("@/components/modal/unsaved-changes-guard", () => ({ UnsavedChangesGuard: () => null }));
vi.mock("@/components/page-state/page-state", () => ({
  PageState: ({ background }: { background?: ReactNode }) => createElement("div", null, background),
}));
vi.mock("@/core/errors/report-application-error", () => ({
  reportApplicationError: vi.fn(),
  runUserAction: (action: () => unknown) => action(),
}));

import { assistantSurfaceProps, claimEscapeForAssistant } from "@/components/modal/assistant-surface";
import { EntityDrawer } from "@/components/entity-detail/entity-drawer";

let container: HTMLDivElement;
let reactRoot: Root;

async function renderDrawerBesideAssistant() {
  await act(async () => {
    reactRoot.render(
      createElement(
        "div",
        null,
        createElement(
          "div",
          { ...assistantSurfaceProps(), id: "agent-panel-dialog" },
          createElement("textarea", { "aria-label": "Ask", id: "agent-composer" }),
        ),
        createElement(EntityDrawer),
        createElement("button", { id: "page-button", type: "button" }, "Page"),
      ),
    );
    await Promise.resolve();
    await Promise.resolve();
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function press(id: string) {
  act(() => {
    document
      .getElementById(id)
      ?.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, cancelable: true, button: 0 }));
  });
}

function pressEscape(id: string) {
  const target = document.getElementById(id);
  if (!target) throw new Error(`Missing #${id}`);
  act(() => target.focus());
  act(() => {
    target.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Escape" }));
  });
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  harness.store.add.mockResolvedValue(undefined);
  harness.store.loadById.mockResolvedValue(undefined);
  harness.store.hasUnsavedChanges = false;
  container = document.createElement("div");
  document.body.append(container);
  reactRoot = createRoot(container);
});

afterEach(() => {
  act(() => reactRoot.unmount());
  container.remove();
  document.body.style.pointerEvents = "";
});

describe("EntityDrawer beside the assistant", () => {
  it("stays open and modal while the assistant panel takes presses and focus", async () => {
    await renderDrawerBesideAssistant();
    const composer = document.getElementById("agent-composer");

    expect(document.getElementById("name")).not.toBeNull();
    expect(document.body.style.pointerEvents).toBe("none");

    press("agent-composer");
    act(() => composer?.focus());

    expect(document.activeElement).toBe(composer);
    expect(harness.popTop).not.toHaveBeenCalled();
    expect(harness.store.close).not.toHaveBeenCalled();
    expect(document.getElementById("name")).not.toBeNull();
  });

  it("leaves Escape pressed in the assistant panel to the assistant and still closes on its own Escape", async () => {
    await renderDrawerBesideAssistant();
    const assistantEscape = vi.fn();
    const onAssistantKeyDown = (event: KeyboardEvent) => {
      if (claimEscapeForAssistant(event)) assistantEscape();
    };
    document.addEventListener("keydown", onAssistantKeyDown);
    try {
      pressEscape("agent-composer");

      expect(assistantEscape).toHaveBeenCalledOnce();
      expect(harness.popTop).not.toHaveBeenCalled();

      pressEscape("name");

      expect(harness.popTop).toHaveBeenCalledOnce();
      expect(assistantEscape).toHaveBeenCalledOnce();
    } finally {
      document.removeEventListener("keydown", onAssistantKeyDown);
    }
  });

  it("still closes on an outside press that is not on an assistant surface", async () => {
    await renderDrawerBesideAssistant();

    press("page-button");

    expect(harness.popTop).toHaveBeenCalledOnce();
  });
});
