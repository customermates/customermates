import type { ComponentProps, ComponentType, ReactNode } from "react";
import type { Root } from "react-dom/client";

import { createElement } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { observable, runInAction } from "mobx";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const testContext = vi.hoisted(() => ({ rootStore: null as Record<string, unknown> | null }));

vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => testContext.rootStore,
}));
vi.mock("../actions", () => ({
  archiveAgentConversationAction: vi.fn(),
  cancelAgentTurnAction: vi.fn(),
  deleteAgentConversationAction: vi.fn(),
  getAgentConfigAction: vi.fn(),
  getAgentConversationAction: vi.fn(),
  listAgentConversationsAction: vi.fn(),
  markAgentConversationReadAction: vi.fn(),
  restoreAgentConversationAction: vi.fn(),
  respondToApprovalAction: vi.fn(),
  respondToUiCommandAction: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/hooks/use-media-query", () => ({ useIsWiderThan: () => true }));
vi.mock("@/components/ui/use-overlay-focus-return", () => ({ useOverlayFocusReturn: () => ({}) }));
vi.mock("@/components/modal/app-modal-action", () => ({
  APP_MODAL_ACTION_RAIL_CLASS: "",
  AppModalAction: () => null,
}));
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: ReactNode }) => createElement("section", null, children),
  DialogContent: ({ children }: { children: ReactNode }) => createElement("div", null, children),
  DialogTitle: ({ children }: { children: ReactNode }) => createElement("h1", null, children),
  DialogDescription: ({ children }: { children: ReactNode }) => createElement("p", null, children),
}));
vi.mock("@/components/ui/drawer", () => ({
  Drawer: ({ children }: { children: ReactNode }) => createElement("section", null, children),
  DrawerContent: ({ children }: { children: ReactNode }) => createElement("div", null, children),
  DrawerTitle: ({ children }: { children: ReactNode }) => createElement("h1", null, children),
  DrawerDescription: ({ children }: { children: ReactNode }) => createElement("p", null, children),
}));
vi.mock("@/components/modal/unsaved-changes-guard", () => ({ UnsavedChangesGuard: () => null }));

import { AppModal } from "@/components/modal/app-modal";
import { NavigationGuardController } from "@/core/stores/navigation-guard.controller";
import { AgentChatStore } from "../agent-chat.store";
import { AgentRouteReloadBridge } from "../agent-route-reload";

type TestAppModalProps = Omit<ComponentProps<typeof AppModal>, "children"> & { children?: ReactNode };
const TestAppModal = AppModal as ComponentType<TestAppModalProps>;

function createStore(navigationGuard: NavigationGuardController) {
  const refreshStore = () => ({ refresh: vi.fn().mockResolvedValue(undefined) });
  const agentUiControlStore = observable({ active: null as { targetId: string } | null });
  const rootStore: Record<string, unknown> = {
    navigationGuard,
    userStore: { user: { id: "user-1", companyId: "company-1" } },
    localeStore: { locale: "en", getTranslation: (key: string) => key },
    contactsStore: refreshStore(),
    organizationsStore: refreshStore(),
    dealsStore: refreshStore(),
    servicesStore: refreshStore(),
    tasksStore: refreshStore(),
    widgetsStore: refreshStore(),
    terminologyStore: refreshStore(),
    messagingThreadsStore: refreshStore(),
    agentUiControlStore,
  };
  const agentChatStore = new AgentChatStore(rootStore as never);
  rootStore.agentChatStore = agentChatStore;
  return { agentChatStore, agentUiControlStore, rootStore };
}

describe("agent route reload integration", () => {
  let container: HTMLDivElement;
  let reactRoot: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.append(container);
    reactRoot = createRoot(container);
  });

  afterEach(() => {
    act(() => reactRoot.unmount());
    container.remove();
    testContext.rootStore = null;
  });

  it("reloads once after a closed assistant, modal work, a draft, and agent guidance all become safe", async () => {
    const navigationGuard = new NavigationGuardController();
    const { agentChatStore: store, agentUiControlStore, rootStore } = createStore(navigationGuard);
    const reload = vi.fn();
    const modalStore = observable.object(
      {
        rootStore,
        isOpen: true,
        isClosingWithGuard: false,
        withUnsavedChangesGuard: true,
        hasUnsavedChanges: true,
        isLoading: true,
        focusReturnTarget: null,
        focusReturnFallback: null,
        close: vi.fn(),
        setIsClosingWithGuard: vi.fn(),
      },
      {},
      { deep: false },
    );
    store.enabled = true;
    store.isOpen = false;
    testContext.rootStore = rootStore;

    act(() => {
      reactRoot.render(
        createElement(
          "div",
          null,
          createElement(AgentRouteReloadBridge, { reload }),
          createElement(
            TestAppModal,
            {
              store: modalStore as never,
              title: "Editing",
            },
            createElement("div", null, "Body"),
          ),
        ),
      );
    });
    expect(navigationGuard.isRouteRefreshBlocked).toBe(true);

    const internalStore = store as unknown as {
      beginActiveTurnMutationTracking: () => number;
      handleEvent: (event: Record<string, unknown>) => void;
    };
    act(() => {
      runInAction(() => {
        store.isWorking = true;
        internalStore.beginActiveTurnMutationTracking();
      });
      internalStore.handleEvent({
        seq: 1,
        type: "activity",
        id: "write-integration",
        activity: { kind: "records.update", resource: "contacts", affectedResources: [], risk: "write" },
      });
      internalStore.handleEvent({
        seq: 2,
        type: "activity_result",
        id: "write-integration",
        isError: false,
        status: "done",
      });
      internalStore.handleEvent({ seq: 3, type: "turn_done", affectedResources: [], hasSuccessfulMutation: true });
      runInAction(() => {
        store.isWorking = false;
      });
    });

    expect(store.hasPendingRouteReload).toBe(true);
    expect(store.routeSyncStatus).toBe("waiting");
    expect(reload).not.toHaveBeenCalled();

    act(() => {
      runInAction(() => {
        store.setComposerDraft("Do not lose this draft");
        modalStore.hasUnsavedChanges = false;
        modalStore.isLoading = false;
      });
    });
    expect(navigationGuard.isRouteRefreshBlocked).toBe(false);
    expect(store.hasPendingRouteReload).toBe(true);
    expect(reload).not.toHaveBeenCalled();

    act(() => {
      runInAction(() => {
        agentUiControlStore.active = { targetId: "contacts-search" };
        store.setComposerDraft("");
      });
    });

    expect(store.hasPendingRouteReload).toBe(true);
    expect(reload).not.toHaveBeenCalled();

    act(() => {
      agentUiControlStore.active = null;
    });

    expect(reload).toHaveBeenCalledOnce();
    expect(store.hasPendingRouteReload).toBe(false);
    expect(store.routeSyncStatus).toBe("refreshing");

    await act(async () => Promise.resolve());
    expect(reload).toHaveBeenCalledOnce();

    act(() => {
      runInAction(() => {
        modalStore.isOpen = false;
        modalStore.hasUnsavedChanges = true;
      });
    });
    expect(navigationGuard.isRouteRefreshBlocked).toBe(false);
  });
});
