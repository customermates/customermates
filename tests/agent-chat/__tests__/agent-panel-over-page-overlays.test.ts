// @vitest-environment jsdom

import type { ComponentProps, ComponentType, ReactNode } from "react";
import type { Root } from "react-dom/client";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { observable, runInAction } from "mobx";
import { observer } from "mobx-react-lite";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

const testContext = vi.hoisted(() => ({ isWide: true, rootStore: null as unknown }));

vi.mock("next-intl", () => ({ useLocale: () => "en", useTranslations: () => (key: string) => key }));
vi.mock("@/hooks/use-media-query", () => ({ useIsWiderThan: () => testContext.isWide }));
vi.mock("@/i18n/navigation", () => ({
  IntlLink: ({ children, ...props }: { children: ReactNode; href: string }) => createElement("a", props, children),
  usePathname: () => "/company/webhooks",
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/core/stores/root-store.provider", () => ({ useRootStore: () => testContext.rootStore }));
vi.mock("@/components/ai-elements/message", () => ({
  MessageResponse: ({ children }: { children: ReactNode }) => createElement("span", null, children),
}));
vi.mock("@/app/components/agent-chat/ui-control.store", () => ({
  findAgentTargetElement: (targetId: string) => document.getElementById(targetId),
}));
vi.mock("@/app/components/agent-chat/agent-route-reload", () => ({ AgentRouteReloadBridge: () => null }));
vi.mock("@/app/components/agent-chat/use-agent-chat-config", () => ({ useAgentChatConfig: () => undefined }));
vi.mock("@/app/components/agent-chat/agent-status-announcer", () => ({
  AgentProgressStatus: () => null,
  AgentStatusAnnouncer: () => null,
}));
vi.mock("@/app/components/agent-chat/conversation-history", () => ({
  ArchiveUndo: () => null,
  ConversationHistory: () => null,
}));
vi.mock("@/app/components/agent-chat/suggested-questions", () => ({ SuggestedQuestions: () => null }));
vi.mock("@/app/components/agent-chat/agent-conversation", () => ({
  AgentComposer: () => createElement("textarea", { "aria-label": "Ask", id: "agent-composer" }),
  AgentConversationLog: () => null,
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/company/webhooks" }));
vi.mock("@/app/[locale]/(protected)/search/actions", () => ({ globalSearchAction: vi.fn() }));
vi.mock("@/components/entity-terminology/use-entity-terminology", () => ({
  useEntityTerminology: () => ({ singular: (entity: string) => entity }),
}));
vi.mock("@/core/stores/use-hydrated-intl-store", () => ({
  useHydratedIntlStore: () => ({
    formatDayMonth: () => "1 Oct",
    formatTime: () => "09:00",
    formatAgentCredits: (credits: number) => ({ credits, amount: String(credits) }),
  }),
}));

import type { AgentChatStore } from "@/app/components/agent-chat/agent-chat.store";

import { AppModal } from "@/components/modal/app-modal";
import { ResponsiveOverlay } from "@/components/modal/responsive-overlay";
import { assistantSurfaceProps } from "@/components/modal/assistant-surface";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AgentChat } from "@/app/components/agent-chat/agent-chat";
import { AgentChatStoreProvider } from "@/app/components/agent-chat/agent-chat-store-context";
import { AgentContextPicker } from "@/app/components/agent-chat/agent-context-picker";
import { UsageRing } from "@/app/components/agent-chat/usage-ring";

type TestAppModalProps = Omit<ComponentProps<typeof AppModal>, "children"> & { children?: ReactNode };
const TestAppModal = AppModal as ComponentType<TestAppModalProps>;

type Spotlight = { note: string | null; stepIndex: number; targetId: string; totalSteps: number };

let container: HTMLDivElement;
let reactRoot: Root;
let page: { dialogOpen: boolean };
let agentChatStore: Record<string, unknown> & { close: Mock<() => void>; isOpen: boolean };
let agentUiControlStore: { active: Spotlight | null; end: Mock<() => void> };
let onDialogClose: Mock<() => void>;

const WebhookDialog = observer(function WebhookDialog() {
  return createElement(
    TestAppModal,
    { open: page.dialogOpen, title: "Webhook", onClose: onDialogClose },
    createElement("input", { "aria-label": "URL", id: "webhook-modal-url" }),
    createElement("input", { "aria-label": "Secret", id: "webhook-modal-secret" }),
  );
});

const addComposerContext = vi.fn();
const mateStore = {
  addComposerContext,
  composerContexts: [],
  contextRegistry: {
    candidates: () => [
      {
        context: {
          reference: { kind: "record", entityType: "deal", recordId: "10000000-0000-4000-8000-000000000001" },
          label: "Acme renewal",
        },
        pageRoute: "/deals/10000000-0000-4000-8000-000000000001",
      },
    ],
  },
  usage: {
    creditsLimit: 100,
    creditsRemaining: 40,
    plan: null,
    recentTurnCredits: null,
    resetAt: "2026-10-01T00:00:00.000Z",
    usedPct: 60,
  },
} as unknown as AgentChatStore;

let matePopovers: { pickerOpen: boolean };

const MatePanelPopovers = observer(function MatePanelPopovers() {
  return createElement(
    "div",
    assistantSurfaceProps(),
    createElement(
      TooltipProvider,
      null,
      createElement(AgentChatStoreProvider, {
        children: createElement(
          "div",
          null,
          createElement(AgentContextPicker, {
            open: matePopovers.pickerOpen,
            restoreComposerFocusOnEscape: false,
            onOpenChange: (open: boolean) => {
              runInAction(() => {
                matePopovers.pickerOpen = open;
              });
            },
          }),
          createElement(UsageRing),
        ),
        store: mateStore,
      }),
    ),
  );
});

function renderPage() {
  act(() => {
    reactRoot.render(
      createElement(
        "div",
        null,
        createElement("button", { id: "nav-assistant", type: "button" }, "Assistant"),
        createElement("button", { id: "company-webhooks-add", type: "button" }, "Add"),
        createElement(AgentChat),
        createElement(WebhookDialog),
      ),
    );
  });
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => requestAnimationFrame(resolve));
  });
}

async function openDialog() {
  act(() => {
    runInAction(() => {
      page.dialogOpen = true;
    });
  });
  await settle();
}

function startTour() {
  act(() => {
    runInAction(() => {
      agentUiControlStore.active = {
        note: "Click **Add**.",
        stepIndex: 0,
        targetId: "company-webhooks-add",
        totalSteps: 2,
      };
    });
  });
}

function element(id: string) {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing #${id}`);
  return found;
}

function tourNextButton() {
  const button = [...document.querySelectorAll("button")].find((item) => item.textContent === "AgentChat.tour.next");
  if (!button) throw new Error("Missing tour Next button");
  return button;
}

function pressEscapeIn(target: HTMLElement) {
  act(() => target.focus());
  expect(document.activeElement).toBe(target);
  act(() => {
    target.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Escape" }));
  });
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  page = observable({ dialogOpen: false });
  onDialogClose = vi.fn(() => {
    runInAction(() => {
      page.dialogOpen = false;
    });
  });
  agentChatStore = observable(
    {
      close: vi.fn(),
      conversationTitle: null,
      enabled: true,
      historyMutationPending: false,
      isExpanded: false,
      isHistoryOpen: false,
      isOpen: true,
      isWorking: false,
      items: [],
      lastArchivedConversation: null,
      newConversation: vi.fn(),
      toggleExpanded: vi.fn(),
      toggleHistory: vi.fn(),
      usage: null,
    },
    { close: false, newConversation: false, toggleExpanded: false, toggleHistory: false },
    { deep: false },
  ) as typeof agentChatStore;
  agentUiControlStore = observable(
    {
      active: null as Spotlight | null,
      end: vi.fn(() => {
        runInAction(() => {
          agentUiControlStore.active = null;
        });
      }),
      nextStep: vi.fn(),
      previousStep: vi.fn(),
      registerNavigate: vi.fn(),
      reportTourTarget: vi.fn(),
    },
    { end: false, nextStep: false, previousStep: false, registerNavigate: false, reportTourTarget: false },
    { deep: false },
  );
  testContext.rootStore = { agentChatStore, agentUiControlStore };
  container = document.createElement("div");
  document.body.append(container);
  reactRoot = createRoot(container);
});

afterEach(() => {
  act(() => reactRoot.unmount());
  container.remove();
  document.body.style.pointerEvents = "";
  testContext.rootStore = null;
});

describe.each([
  ["dialog", true],
  ["drawer", false],
] as const)("Escape beside an app %s", (surface, isWide) => {
  beforeEach(() => {
    testContext.isWide = isWide;
  });

  it("closes only the assistant panel when pressed in it, and the page overlay stays open", async () => {
    renderPage();
    await openDialog();

    pressEscapeIn(element("agent-composer"));
    await settle();

    expect(agentChatStore.close).toHaveBeenCalledOnce();
    expect(onDialogClose).not.toHaveBeenCalled();
    expect(document.querySelector(`[data-slot="${surface}-content"]`)).not.toBeNull();
  });

  it("closes only the page overlay when pressed in it, and the assistant panel stays open", async () => {
    renderPage();
    await openDialog();

    pressEscapeIn(element("webhook-modal-secret"));
    await settle();

    expect(onDialogClose).toHaveBeenCalledOnce();
    expect(agentChatStore.close).not.toHaveBeenCalled();
    expect(document.getElementById("agent-panel-dialog")).not.toBeNull();
  });

  it("ends only the tour when pressed on its card after the tour step opened the page overlay", async () => {
    runInAction(() => {
      agentChatStore.isOpen = false;
    });
    renderPage();
    startTour();
    await openDialog();

    pressEscapeIn(tourNextButton());
    await settle();

    expect(agentUiControlStore.end).toHaveBeenCalledOnce();
    expect(onDialogClose).not.toHaveBeenCalled();
    expect(document.getElementById("webhook-modal-secret")).not.toBeNull();
  });

  it("ends only the tour when pressed in the assistant panel during a tour over the page overlay", async () => {
    renderPage();
    startTour();
    await openDialog();

    pressEscapeIn(element("agent-composer"));
    await settle();

    expect(agentUiControlStore.end).toHaveBeenCalledOnce();
    expect(agentChatStore.close).not.toHaveBeenCalled();
    expect(onDialogClose).not.toHaveBeenCalled();
  });

  it("closes only the page overlay when pressed in it during a tour", async () => {
    renderPage();
    startTour();
    await openDialog();

    pressEscapeIn(element("webhook-modal-secret"));
    await settle();

    expect(onDialogClose).toHaveBeenCalledOnce();
    expect(agentUiControlStore.end).not.toHaveBeenCalled();
    expect(agentChatStore.close).not.toHaveBeenCalled();
  });
});

describe.each([
  ["dialog", true],
  ["drawer", false],
] as const)("Closing the assistant panel beside an app %s", (_surface, isWide) => {
  beforeEach(() => {
    testContext.isWide = isWide;
  });

  it("leaves focus and the caret on the field the user went back to", async () => {
    const getClientRects = Object.getOwnPropertyDescriptor(Element.prototype, "getClientRects");
    Object.defineProperty(Element.prototype, "getClientRects", {
      configurable: true,
      value: () => [new DOMRect(0, 0, 10, 10)],
    });
    try {
      renderPage();
      await openDialog();
      const url = element("webhook-modal-url") as HTMLInputElement;
      const secret = element("webhook-modal-secret") as HTMLInputElement;
      act(() => url.focus());
      act(() => element("agent-composer").focus());
      act(() => secret.focus());
      secret.value = "whsec-draft";
      secret.setSelectionRange(secret.value.length, secret.value.length);

      act(() => {
        runInAction(() => {
          agentChatStore.isOpen = false;
        });
      });
      await settle();

      expect(document.activeElement).toBe(secret);
      expect(secret.selectionStart).toBe(secret.value.length);
      expect(onDialogClose).not.toHaveBeenCalled();
    } finally {
      if (getClientRects) Object.defineProperty(Element.prototype, "getClientRects", getClientRects);
    }
  });
});

describe.each([
  ["dialog", true],
  ["drawer", false],
] as const)("A popover the assistant panel opens beside an app %s", (surface, isWide) => {
  const originalScrollIntoView = Object.getOwnPropertyDescriptor(Element.prototype, "scrollIntoView");

  beforeEach(() => {
    testContext.isWide = isWide;
    addComposerContext.mockClear();
    matePopovers = observable({ pickerOpen: false });
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    Object.defineProperty(Element.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
    act(() => {
      reactRoot.render(createElement("div", null, createElement(MatePanelPopovers), createElement(WebhookDialog)));
    });
  });

  afterEach(() => {
    if (originalScrollIntoView) Object.defineProperty(Element.prototype, "scrollIntoView", originalScrollIntoView);
    else Reflect.deleteProperty(Element.prototype, "scrollIntoView");
    vi.unstubAllGlobals();
  });

  async function openContextPicker() {
    await openDialog();
    act(() => {
      runInAction(() => {
        matePopovers.pickerOpen = true;
      });
    });
    await settle();
  }

  function pickerItem(label: string) {
    const item = [...document.querySelectorAll<HTMLElement>("[cmdk-item]")].find((candidate) =>
      candidate.textContent?.includes(label),
    );
    if (!item) throw new Error(`Missing picker item ${label}`);
    return item;
  }

  it("keeps the page overlay open when a context is pressed and picked", async () => {
    await openContextPicker();
    const item = pickerItem("Acme renewal");

    act(() => {
      item.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0, cancelable: true }));
    });
    act(() => item.click());
    await settle();

    expect(addComposerContext).toHaveBeenCalledOnce();
    expect(onDialogClose).not.toHaveBeenCalled();
    expect(document.querySelector(`[data-slot="${surface}-content"]`)).not.toBeNull();
  });

  it("lets the context list take the wheel instead of the page overlay's scroll lock", async () => {
    await openContextPicker();
    const wheel = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: 40 });

    act(() => {
      pickerItem("Acme renewal").dispatchEvent(wheel);
    });

    expect(wheel.defaultPrevented).toBe(false);
  });

  it("keeps the page overlay open when the credit usage popover is pressed", async () => {
    await openDialog();
    act(() => element("agent-usage").click());
    await settle();
    const usage = document.querySelector<HTMLElement>('[data-slot="popover-content"]');
    if (!usage) throw new Error("Missing usage popover");

    act(() => {
      usage.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0, cancelable: true }));
    });
    await settle();

    expect(onDialogClose).not.toHaveBeenCalled();
    expect(document.querySelector(`[data-slot="${surface}-content"]`)).not.toBeNull();
  });
});

describe.each([
  ["popover", true],
  ["drawer", false],
] as const)("Closing the assistant panel beside an open display options %s", (surface, isWide) => {
  const originalGetClientRects = Object.getOwnPropertyDescriptor(Element.prototype, "getClientRects");
  let onDisplayOptionsOpenChange: Mock<(open: boolean) => void>;

  beforeEach(() => {
    testContext.isWide = isWide;
    onDisplayOptionsOpenChange = vi.fn();
    Object.defineProperty(Element.prototype, "getClientRects", {
      configurable: true,
      value: () => [new DOMRect(0, 0, 10, 10)],
    });
  });

  afterEach(() => {
    if (originalGetClientRects) Object.defineProperty(Element.prototype, "getClientRects", originalGetClientRects);
  });

  async function renderDisplayOptions() {
    act(() => {
      reactRoot.render(
        createElement(
          "div",
          null,
          createElement("button", { id: "nav-assistant", type: "button" }, "Assistant"),
          createElement(AgentChat),
          createElement(ResponsiveOverlay, {
            children: createElement("button", { id: "deals-layout-board", type: "button" }, "Board"),
            open: true,
            title: "Display options",
            trigger: createElement("button", { id: "deals-display-options", type: "button" }, "Display"),
            onOpenChange: onDisplayOptionsOpenChange,
          }),
        ),
      );
    });
    await settle();
  }

  async function closePanel() {
    act(() => {
      runInAction(() => {
        agentChatStore.isOpen = false;
      });
    });
    await settle();
  }

  it("keeps the overlay open and focus in it when the panel closes while the overlay has focus", async () => {
    await renderDisplayOptions();
    const board = element("deals-layout-board");
    act(() => board.focus());

    await closePanel();

    expect(document.activeElement).toBe(board);
    expect(onDisplayOptionsOpenChange).not.toHaveBeenCalled();
    expect(document.querySelector(`[data-slot="${surface}-content"]`)).not.toBeNull();
  });

  it("returns focus to the overlay control the user came from when the panel closes", async () => {
    await renderDisplayOptions();
    const board = element("deals-layout-board");
    const composer = element("agent-composer");
    act(() => board.focus());
    act(() => {
      composer.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0, cancelable: true }));
    });
    act(() => composer.focus());
    expect(document.activeElement).toBe(composer);

    await closePanel();

    expect(document.activeElement).toBe(board);
    expect(onDisplayOptionsOpenChange).not.toHaveBeenCalled();
  });
});
