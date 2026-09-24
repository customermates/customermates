import type { ComponentProps, ComponentType, ReactNode } from "react";
import type { Root } from "react-dom/client";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { observable, runInAction } from "mobx";
import { observer } from "mobx-react-lite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const testContext = vi.hoisted(() => ({ rootStore: null as unknown }));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/hooks/use-media-query", () => ({ useIsWiderThan: () => true }));
vi.mock("@/i18n/navigation", () => ({
  IntlLink: ({ children, ...props }: { children: ReactNode; href: string }) => createElement("a", props, children),
}));
vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => testContext.rootStore,
}));
vi.mock("@/components/ai-elements/message", () => ({
  MessageResponse: ({ children }: { children: ReactNode }) => createElement("span", null, children),
}));
vi.mock("../ui-control.store", () => ({
  findAgentTargetElement: (targetId: string) => document.getElementById(targetId),
}));

import { AppModal } from "@/components/modal/app-modal";
import { AgentTourOverlay } from "../agent-tour-overlay";

type TestAppModalProps = Omit<ComponentProps<typeof AppModal>, "children"> & { children?: ReactNode };
const TestAppModal = AppModal as ComponentType<TestAppModalProps>;

let container: HTMLDivElement;
let reactRoot: Root;

function nextButton() {
  const button = [...document.querySelectorAll("button")].find((item) => item.textContent === "AgentChat.tour.next");
  if (!button) throw new Error("Missing tour Next button");
  return button;
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
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

describe("AgentTourOverlay over an app dialog", () => {
  it("keeps the tour popover usable after its step opens a dialog", async () => {
    const onClose = vi.fn();
    const nextStep = vi.fn();
    const dialog = observable({ open: false });
    testContext.rootStore = {
      agentChatStore: { enabled: true, isOpen: false },
      agentUiControlStore: observable(
        {
          active: { note: "Click **Add**.", stepIndex: 0, targetId: "company-webhooks-add", totalSteps: 2 },
          end: vi.fn(),
          nextStep,
          previousStep: vi.fn(),
        },
        { end: false, nextStep: false, previousStep: false },
      ),
    };
    const WebhookDialog = observer(() =>
      createElement(
        TestAppModal,
        { open: dialog.open, title: "Webhook", onClose },
        createElement("input", { "aria-label": "Secret", id: "webhook-modal-secret" }),
      ),
    );

    act(() => {
      reactRoot.render(
        createElement(
          "div",
          null,
          createElement("button", { id: "company-webhooks-add", type: "button" }, "Add"),
          createElement(AgentTourOverlay),
          createElement(WebhookDialog),
        ),
      );
    });
    const popover = document.querySelector<HTMLElement>('[data-slot="popover-content"]');
    expect(popover).not.toBeNull();

    act(() => {
      runInAction(() => {
        dialog.open = true;
      });
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const next = nextButton();

    act(() => {
      next.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, cancelable: true, button: 0 }));
      next.focus();
      next.click();
    });

    expect(nextStep).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(next);
    expect(popover?.style.pointerEvents).not.toBe("none");
    expect(document.getElementById("webhook-modal-secret")).not.toBeNull();
  });
});
