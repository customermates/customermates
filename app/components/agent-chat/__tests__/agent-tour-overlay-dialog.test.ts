import type { ComponentProps, ComponentType, ReactNode } from "react";
import type { Root } from "react-dom/client";

import { act, createElement, useState } from "react";
import { createRoot } from "react-dom/client";
import { observable, runInAction } from "mobx";
import { observer } from "mobx-react-lite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const testContext = vi.hoisted(() => ({ isWide: true, rootStore: null as unknown }));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/hooks/use-media-query", () => ({ useIsWiderThan: () => testContext.isWide }));
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

function tourStore(active: { note: string | null; stepIndex: number; targetId: string; totalSteps: number } | null) {
  return observable(
    { active, end: vi.fn(), nextStep: vi.fn(), previousStep: vi.fn(), reportTourTarget: vi.fn() },
    { end: false, nextStep: false, previousStep: false, reportTourTarget: false },
  );
}

function InviteContent() {
  const [tab, setTab] = useState<"link" | "email">("link");

  return createElement(
    "div",
    null,
    createElement("button", { id: "invite-modal-tab-email", type: "button", onClick: () => setTab("email") }, "Email"),
    tab === "email" ? createElement("input", { "aria-label": "Emails", id: "invite-modal-emails" }) : null,
  );
}

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

describe.each([
  ["dialog", true],
  ["drawer", false],
] as const)("AgentTourOverlay over an app %s", (surface, isWide) => {
  beforeEach(() => {
    testContext.isWide = isWide;
  });

  it("keeps the tour popover usable after its step opens a dialog", async () => {
    const onClose = vi.fn();
    const nextStep = vi.fn();
    const dialog = observable({ open: false });
    testContext.rootStore = {
      agentChatStore: { enabled: true, isOpen: false },
      agentUiControlStore: observable(
        {
          active: { note: "Click **Add**.", stepIndex: 0, targetId: "settings-webhooks-add", totalSteps: 2 },
          end: vi.fn(),
          nextStep,
          previousStep: vi.fn(),
          reportTourTarget: vi.fn(),
        },
        { end: false, nextStep: false, previousStep: false, reportTourTarget: false },
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
          createElement("button", { id: "settings-webhooks-add", type: "button" }, "Add"),
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
    expect(document.body.style.pointerEvents).toBe("none");
    expect(popover?.style.pointerEvents).toBe("auto");
    expect(next.closest("[aria-hidden='true']")).toBeNull();
    expect(document.getElementById("webhook-modal-secret")).not.toBeNull();
  });

  it("keeps an open dialog mounted with its state while a spotlight or tour starts and ends over it", async () => {
    const uiControl = tourStore(null);
    testContext.rootStore = { agentChatStore: { enabled: true, isOpen: false }, agentUiControlStore: uiControl };
    act(() => {
      reactRoot.render(
        createElement(
          "div",
          null,
          createElement(AgentTourOverlay),
          createElement(TestAppModal, { open: true, title: "Invite", onClose: vi.fn() }, createElement(InviteContent)),
        ),
      );
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    act(() => document.getElementById("invite-modal-tab-email")?.click());
    const content = document.querySelector(`[data-slot="${surface}-content"]`);
    const emails = document.getElementById("invite-modal-emails") as HTMLInputElement;
    act(() => emails.focus());
    emails.value = "e2e-gm-b";

    for (const note of [null, "Type the **emails**."]) {
      act(() => {
        runInAction(() => {
          uiControl.active = { note, stepIndex: 0, targetId: "invite-modal-emails", totalSteps: 1 };
        });
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      act(() => {
        runInAction(() => {
          uiControl.active = null;
        });
      });
    }

    expect(document.querySelector(`[data-slot="${surface}-content"]`)).toBe(content);
    expect(document.getElementById("invite-modal-emails")).toBe(emails);
    expect(emails.value).toBe("e2e-gm-b");
  });
});
